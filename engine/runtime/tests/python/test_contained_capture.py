"""Scope pins never grant production control or select a game as a kill target."""

import sys
import unittest
from dataclasses import asdict
from types import SimpleNamespace
from unittest.mock import Mock, patch

from live_probe_control.camera_workers import CameraWorkers
from live_probe_control.contained_capture import GameCaptureContext, PinnedGameCapture
from live_probe_control.contracts import Generation, Policy, Request
from live_probe_control.peer_control import WorkerProbePort
from live_probe_control.peer_protocol import command
from live_probe_control.probe_transport import EngineeringControl

CTX = GameCaptureContext(10, 100, 11, 110, 12, 120, 1, 99)
POLICY = Policy(24, 60, 5000000000, 3, 12000000000, 1000000000, 20, 100000000)
PROFILE = {"id": "balanced", "fps": 30, "bitrate_kbps": 1500}
GEN = Generation("owner", "pipeline", "peer")


class CapturePinsTests(unittest.TestCase):
    def setUp(self):
        self.now = 1000000000
        self.poller = Mock()
        self.poller.poll.return_value = []
        self.identity = {10: (1, 100), 11: (10, 110), 12: (10, 120)}
        for patcher in (
            patch("live_probe_control.contained_capture.sys.platform", "linux"),
            patch("live_probe_control.contained_capture.os.pidfd_open", side_effect=iter(range(100, 130)), create=True),
            patch("live_probe_control.contained_capture.select.poll", return_value=self.poller),
            patch("live_probe_control.contained_capture.process_identity", side_effect=lambda pid: self.identity[pid]),
        ):
            patcher.start()
            self.addCleanup(patcher.stop)
        self.socket = patch("live_probe_control.contained_capture.socket_identity", return_value=(1, 99)).start()
        self.addCleanup(patch.stopall)
        self.closed = patch("live_probe_control.contained_capture.os.close").start()

    def pin(self):
        return PinnedGameCapture(CTX, expected_owner=10, clock=lambda: self.now)

    def test_exact_pins_close_only_owned_descriptors_and_remain_invalid_after_close(self):
        lease = self.pin()
        self.assertTrue(lease.healthy())
        lease.close()
        lease.close()
        self.assertFalse(lease.healthy())
        self.assertEqual([c.args[0] for c in self.closed.call_args_list], [100, 101, 102])

    def test_wrong_owner_parent_or_start_is_rejected_without_a_lease(self):
        with self.assertRaisesRegex(ValueError, "owner"):
            PinnedGameCapture(CTX, expected_owner=9)
        for value in ((9, 110), (10, 111)):
            self.identity[11] = value
            with self.assertRaisesRegex(ValueError, "lifetime/parent"):
                self.pin()

    def test_socket_replacement_is_a_sticky_failure(self):
        lease = self.pin()
        self.socket.return_value = (1, 100)
        self.now += 250000000
        self.assertFalse(lease.healthy())
        self.socket.return_value = (1, 99)
        self.assertFalse(lease.healthy(force=True))
        lease.close()

    def test_reversed_clock_fails_closed(self):
        lease = self.pin()
        self.now -= 1
        self.assertFalse(lease.healthy())
        lease.close()

    def test_pidfd_liveness_is_checked_even_between_filesystem_checks(self):
        lease = self.pin()
        self.poller.poll.return_value = [(101, 1)]
        self.assertFalse(lease.healthy())
        lease.close()

    def test_periodic_fs_checks_are_bounded_but_setter_forces_fresh_identity(self):
        lease = self.pin()
        calls = self.socket.call_count
        for _ in range(10):
            self.now += 1000000
            self.assertTrue(lease.healthy())
        self.assertEqual(self.socket.call_count, calls)
        self.socket.return_value = (2, 99)
        self.assertFalse(lease.healthy(force=True))
        lease.close()


class CaptureBoundaryTests(unittest.TestCase):
    def test_closed_context_and_synthetic_wire_shape(self):
        self.assertEqual(GameCaptureContext.from_wire(asdict(CTX)), CTX)
        for bad in ({**asdict(CTX), "display": ":0"}, {**asdict(CTX), "game_pid": True}):
            with self.assertRaises(ValueError):
                GameCaptureContext.from_wire(bad)
        synthetic = EngineeringControl("/tmp/owner", POLICY, 1, 2)
        game = EngineeringControl("/tmp/owner", POLICY, 1, 2, CTX)
        self.assertEqual(set(synthetic.wire()), {"directory", "policy", "device", "inode"})
        self.assertEqual(EngineeringControl.from_wire(game.wire()), game)
        for config in (synthetic, game):
            self.assertFalse(config.matches_source("production"))
        self.assertFalse(game.matches_source("isolated_synthetic"))
        self.assertFalse(synthetic.matches_source("isolated_game"))

    def test_bootstrap_requires_matching_source_context_and_rejects_production_control(self):
        game = EngineeringControl("/tmp/owner", POLICY, 1, 2, CTX)
        base = {"profile": PROFILE, "ice_servers": [], "source": "isolated_game", "control": game.wire()}
        command(GEN, 0, "bootstrap", base)
        for bad in ({**base, "source": "production"}, {**base, "source": "isolated_synthetic"},
                    {"profile": PROFILE, "ice_servers": [], "source": "isolated_game"}):
            with self.assertRaises(ValueError):
                command(GEN, 0, "bootstrap", bad)

    def test_adapter_validates_complete_bootstrap_before_allocating_workers(self):
        config = EngineeringControl("/tmp/owner", POLICY, 1, 2, CTX)
        with patch.object(EngineeringControl, "check_capture") as checked:
            service = CameraWorkers(PROFILE, "[]", 2, source="isolated_game", control=config)
            checked.assert_called_once_with()
            self.assertEqual(service.active, {})
            self.assertIs(service.control, config)
            self.assertTrue(service.close())

    def test_lost_capture_blocks_both_target_and_restore_setters_without_native_writes(self):
        media = SimpleNamespace(bootstrap={"body": {"profile": PROFILE}}, latest_snapshot=None,
                                capture_lease=SimpleNamespace(healthy=lambda **_: False), pipeline=Mock())
        port = WorkerProbePort(media, Request("request", GEN, 24, 10**9), Mock(), sys.maxsize)
        for fps in (24, 30):
            with self.assertRaisesRegex(ValueError, "capture identity lost"):
                port.set_fps(fps)
        self.assertFalse(port.touched)
        media.pipeline.get_by_name.assert_not_called()
