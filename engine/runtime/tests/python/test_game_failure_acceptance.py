"""Fault injection owns only its private socket and never overwrites foreign cleanup state."""

import socket
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts" / "n10"))
from game_failure_acceptance import GameFailureAcceptance, SourceSocketSwap


class SocketFaultTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(dir="/tmp")
        self.addCleanup(self.directory.cleanup)
        self.path = Path(self.directory.name) / "X99"
        self.original = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.addCleanup(self.original.close)
        self.original.bind(str(self.path))
        info = self.path.lstat()
        self.capture = SimpleNamespace(socket_device=info.st_dev, socket_inode=info.st_ino)
        self.enterContext(patch("game_failure_acceptance.SOCKET", self.path))
        self.enterContext(patch("game_failure_acceptance.socket_identity", side_effect=lambda: (self.path.lstat().st_dev, self.path.lstat().st_ino)))
        self.enterContext(patch("game_failure_acceptance.GameCaptureContext.from_scene", return_value=self.capture))

    def test_owned_identity_is_changed_then_exact_original_restored_once(self):
        swap = SourceSocketSwap(object(), self.capture)
        self.assertNotEqual(self.path.lstat().st_ino, self.capture.socket_inode)
        self.assertEqual(swap.backup.lstat().st_ino, self.capture.socket_inode)
        self.assertGreaterEqual(self.original.fileno(), 0)
        swap.close()
        swap.close()
        self.assertEqual(self.path.lstat().st_ino, self.capture.socket_inode)
        self.assertFalse(swap.backup.exists())
        self.assertGreaterEqual(self.original.fileno(), 0)

    def test_foreign_replacement_is_not_unlinked_or_overwritten(self):
        swap = SourceSocketSwap(object(), self.capture)
        self.addCleanup(swap.replacement.close)
        self.path.unlink()
        foreign = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.addCleanup(foreign.close)
        foreign.bind(str(self.path))
        inode = self.path.lstat().st_ino
        with self.assertRaisesRegex(ValueError, "identity changed"):
            swap.close()
        self.assertEqual(self.path.lstat().st_ino, inode)
        self.assertTrue(swap.backup.exists())

    def test_wrong_capture_is_rejected_before_any_filesystem_mutation(self):
        with self.assertRaisesRegex(ValueError, "exact owned"):
            SourceSocketSwap(object(), object())
        self.assertEqual(self.path.lstat().st_ino, self.capture.socket_inode)
        self.assertEqual(len(list(self.path.parent.iterdir())), 1)


class RestartReadinessTests(unittest.TestCase):
    def test_post_restart_failure_retains_cached_reason_before_abort(self):
        driver = GameFailureAcceptance.__new__(GameFailureAcceptance)
        driver.swap = None
        driver.stage = "post-restart"
        driver.origin = 0
        driver.last_slot_failure = None
        driver.last_readiness = {"second": {"readiness_diagnostics": {"reasons": ["native_source_progress_absent"]}}}
        slots = {"second": SimpleNamespace(owner=SimpleNamespace(last_observation=({}, 0, 1)))}
        driver.slots = Mock(return_value=slots)
        driver.ready = Mock(return_value=False)
        driver.emit = Mock()
        with self.assertRaisesRegex(ValueError, "post-restart readiness lost"):
            driver.tick()
        driver.ready.assert_called_once()
        self.assertEqual(driver.emit.call_args.args, ("game_failure_readiness_lost",))
        self.assertEqual(driver.emit.call_args.kwargs["stage"], "post_restart")
        self.assertEqual(driver.emit.call_args.kwargs["receivers"], driver.last_readiness)


class EarlyOutcomeTests(unittest.TestCase):
    def test_early_controller_outcome_is_retained_before_fault_abort(self):
        from live_probe_control.contracts import Result
        driver = GameFailureAcceptance.__new__(GameFailureAcceptance)
        driver.swap = None
        driver.stage, driver.stage_start = "active", 0
        driver.case = "controller-thread-block"
        driver.old = SimpleNamespace(owner=SimpleNamespace(last_observation=({}, 0, 1)))
        driver.draft = SimpleNamespace(expires_ns=1)
        driver.operation = SimpleNamespace(
            done=SimpleNamespace(is_set=lambda: True), status="observed", rejection=None,
            result=Result("request", "aborted", "verified_by_port", "apply_failed"),
            lease=lambda: {"observed_ns": 0, "healthy": True})
        driver.emit = Mock()
        driver.inject_fault = Mock()
        with self.assertRaisesRegex(ValueError, "fault missed"):
            driver.tick()
        driver.inject_fault.assert_not_called()
        self.assertEqual(driver.emit.call_args.args, ("game_failure_operation_ended_before_fault",))
        self.assertEqual(driver.emit.call_args.kwargs["result"]["reason"], "apply_failed")
        self.assertFalse(driver.emit.call_args.kwargs["live_authority"])
