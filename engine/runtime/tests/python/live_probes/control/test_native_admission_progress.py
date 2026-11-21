"""Deterministic counter schedules through the actual worker admission loop."""

import sys
import threading
import unittest
from collections import deque
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[4]))
from live_probes.control import test_live_probe_controller as fixtures
from research.live_probe_control.control.contracts import Request, Result
from research.live_probe_control.peers.peer_control import PeerControl, WorkerProbePort
from research.live_probe_control.peers.peer_protocol import event_body


def exercise_admission(schedule, *, read_delay_ns=0, expires_after_ns=250_000_000):
    """Synthetic clock/native counters; execute real port, loop and IPC validation."""
    now = [2_000_000_000]
    origin = now[0]
    calls = [0]
    native = dict(configured_fps=30, negotiated_fps=30, width=640, height=480,
                  target_bitrate=1500, cpu_used=6, max_quantizer=48, state="playing",
                  connection_state="connected", ice_connection_state="connected",
                  capture_buffers=10, encoded_buffers=10)

    def snapshot():
        calls[0] += 1
        now[0] += read_delay_ns
        capture, encoded = schedule(calls[0])
        return dict(native, capture_buffers=capture, encoded_buffers=encoded)

    lease = SimpleNamespace(healthy=lambda: True,
                            delivery=deque([dict(sequence=1, observed_ns=1, received_ns=1)]),
                            lock=threading.Lock())
    request = Request("schedule", fixtures.GEN, 24, 10**9)
    media = SimpleNamespace(bootstrap={"body": {"profile": {"fps": 30}}},
                            latest_snapshot=(dict(native), now[0]), snapshot=snapshot)
    port = WorkerProbePort(media, request, lease, origin + expires_after_ns)
    child = PeerControl(SimpleNamespace(bootstrap={"body": {}}), Mock())
    child.port, child.lease, child.config = port, lease, Mock()
    control = Mock()
    control.execute.return_value = Result("schedule", "completed", "verified_by_port", "duration_elapsed")
    control.failure_diagnostic = None
    manager = Mock()
    manager.__enter__ = Mock(return_value=control)
    manager.__exit__ = Mock(return_value=False)
    with patch("research.live_probe_control.peers.peer_control.time.monotonic_ns",
               side_effect=lambda: now[0]), patch(
                   "research.live_probe_control.peers.peer_control.time.sleep",
                   side_effect=lambda seconds: now.__setitem__(0, now[0] + int(seconds * 10**9))), patch(
                       "research.live_probe_control.peers.peer_control.CadenceController", return_value=manager) as controller:
        child._execute(request)
    body = child.results.get_nowait()
    event_body("probe_result", body)
    return dict(body=body, elapsed_ns=now[0]-origin, native_reads=calls[0],
                controller_opened=controller.called, native_setter_touched=port.touched)


class NativeAdmissionProgressTests(unittest.TestCase):
    def test_alternating_progress_admits_after_both_counters_advance(self):
        result = exercise_admission(lambda i: (10 + (i+1)//2, 10 + i//2))
        self.assertTrue(result["controller_opened"])
        self.assertEqual(result["native_reads"], 2)
        self.assertIsNone(result["body"]["rejection"])

    def test_joint_progress_still_admits(self):
        result = exercise_admission(lambda i: (10+i, 10+i))
        self.assertTrue(result["controller_opened"])
        self.assertEqual(result["native_reads"], 1)

    def test_stall_and_single_counter_progress_never_admit(self):
        for schedule in (lambda i: (10, 10), lambda i: (10+i, 10), lambda i: (10, 10+i)):
            with self.subTest(schedule=schedule):
                result = exercise_admission(schedule)
                self.assertFalse(result["controller_opened"])
                self.assertFalse(result["native_setter_touched"])
                self.assertEqual(result["elapsed_ns"], 150_000_000)
                self.assertEqual(result["body"]["rejection_stage"], "fresh_source")

    def test_counter_regression_cannot_recover_to_admission(self):
        result = exercise_admission(lambda i: (9, 9) if i == 1 else (10+i, 10+i))
        self.assertFalse(result["controller_opened"])
        self.assertFalse(result["body"]["rejection_health_checks"]["native_valid"])

    def test_slow_healthy_getter_cannot_cross_admission_budget(self):
        result = exercise_admission(lambda i: (10+i, 10+i), read_delay_ns=160_000_000)
        self.assertFalse(result["controller_opened"])
        self.assertFalse(result["native_setter_touched"])

    def test_slow_healthy_getter_cannot_cross_request_expiry(self):
        result = exercise_admission(lambda i: (10+i, 10+i), read_delay_ns=20_000_000,
                                    expires_after_ns=15_000_000)
        self.assertFalse(result["controller_opened"])


if __name__ == "__main__":
    unittest.main()
