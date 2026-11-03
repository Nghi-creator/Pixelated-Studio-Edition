"""Native paired state machine: whole phases cannot overrun or invent restoration."""
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch
from threading import Event

sys.path.insert(0, str(Path(__file__).resolve().parents[4] / "scripts/research/n10"))
from paired_observation import PairedObservation
from research.live_probe_control.control.contracts import Result, Request, Generation


class PairedObservationTests(unittest.TestCase):
    def make(self, directory):
        p = object.__new__(PairedObservation)
        p.stage, p.phase, p.origin, p.stage_start = "eligibility", "degraded", 0, 0
        p.identities, p.native_sequence = None, None
        p.marker_root = Path(directory)
        self.time = 100000000
        p.now = lambda: self.time
        self.body = dict(configured_fps=30, negotiated_fps=30, capture_buffers=1, encoded_buffers=1)
        self.slot = SimpleNamespace(owner=SimpleNamespace(last_observation=(self.body, self.time, 1)))
        p.service = SimpleNamespace(active={"first": self.slot})
        p.scene = SimpleNamespace(game=SimpleNamespace(poll=lambda: None))
        p.slots = lambda peers: {"first": self.slot}
        p.identity = lambda slots: {"first": "owned"}
        p.ready = lambda slots: True
        p.target_ready = lambda slots, target: self.body["configured_fps"] == self.body["negotiated_fps"] == target
        p.emit = Mock()
        p.scopes, p.capability = {"first": "handle"}, object()
        p.operation = SimpleNamespace(done=Event(), result=None)
        p.local = Mock(directory=directory)
        p.local.prepare.return_value = SimpleNamespace(request=Request("n11-paired-request", Generation("owner", "pipeline", "first"), 24, 5000000000))
        p.local.dispatch.return_value = p.operation
        return p

    def marker(self, p, kind):
        (p.marker_root / ("n11-"+kind+"-"+p.phase+".json")).write_text('{"complete":true}')

    def test_prime_and_stable_target_precede_measurement(self):
        with tempfile.TemporaryDirectory() as directory:
            p = self.make(directory)
            p.tick(); self.assertEqual(p.stage, "prime")
            self.marker(p, "prime"); p.tick(); self.assertEqual(p.stage, "settle")
            self.time += 499999999; p.tick(); self.assertEqual(p.stage, "settle")
            self.time += 1; p.tick(); self.assertEqual(p.stage, "measure")
            self.time += 3000000000
            self.marker(p, "phase"); p.tick()
            self.assertEqual((p.phase, p.stage), ("relief", "target"))
            self.assertEqual(p.local.dispatch.call_count, 1)

    def test_action_boundary_fails_even_before_controller_result_is_done(self):
        with tempfile.TemporaryDirectory() as directory:
            p = self.make(directory)
            p.phase, p.stage, p.dispatched_at = "relief", "measure", 0
            p.identities = {"first": "owned"}
            self.body.update(configured_fps=24, negotiated_fps=24)
            self.time = 5000000000
            with self.assertRaisesRegex(ValueError, "five-second"):
                p.tick()

    def test_target_loss_identity_loss_or_early_controller_end_fails(self):
        with tempfile.TemporaryDirectory() as directory:
            for failure in ("target", "identity", "result"):
                p = self.make(directory)
                p.phase, p.stage, p.dispatched_at = "relief", "measure", 0
                p.identities = {"first": "owned"}
                self.body.update(configured_fps=24, negotiated_fps=24)
                if failure == "target": self.body["negotiated_fps"] = 30
                if failure == "identity": p.identity = lambda slots: {"first": "replacement"}
                if failure == "result": p.operation.done.set()
                with self.assertRaises(ValueError): p.tick()

    def test_start_deadline_and_malformed_marker_cannot_pass(self):
        with tempfile.TemporaryDirectory() as directory:
            p = self.make(directory)
            p.phase, p.stage, p.dispatched_at = "relief", "prime", 0
            self.time = 1750000001
            with self.assertRaisesRegex(ValueError, "start deadline"): p.tick()
            p = self.make(directory); p.tick()
            (p.marker_root / "n11-prime-degraded.json").write_text('{"complete":false}')
            with self.assertRaisesRegex(ValueError, "marker"): p.tick()

    def test_recovery_requires_completed_result_and_clean_full_reservation(self):
        with tempfile.TemporaryDirectory() as directory:
            for restoration, state, reservation in (("unknown", "dirty", 7000000000), ("verified_by_port", "dirty", 7000000000), ("verified_by_port", "clean", 5000000000), ("verified_by_port", "clean", 7000000000)):
                p = self.make(directory)
                p.phase, p.stage, p.dispatched_at = "relief", "result", 0
                p.operation.done.set()
                p.operation.result = Result("n11-paired-request", "completed" if restoration == "verified_by_port" else "aborted", restoration, "duration_elapsed" if restoration == "verified_by_port" else "restore_failed")
                journal = Mock(); journal.__enter__ = Mock(return_value=SimpleNamespace(journal=dict(state=state, actions=1, reserved_ns=reservation)))
                journal.__exit__ = Mock(return_value=False)
                with patch("paired_observation.CadenceJournal", return_value=journal):
                    if state == "clean" and reservation == 7000000000:
                        p.tick(); self.assertEqual((p.phase, p.stage), ("recovery", "target"))
                    else:
                        with self.assertRaises(ValueError): p.tick()

    def test_premature_whole_phase_marker_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            p = self.make(directory)
            p.stage, p.identities = "measure", {"first": "owned"}
            self.marker(p, "phase")
            with self.assertRaisesRegex(ValueError, "premature"):
                p.tick()

    def test_terminal_checkpoint_does_not_create_an_unexecuted_journal(self):
        with tempfile.TemporaryDirectory() as directory:
            p = self.make(directory)
            p.checkpoint()
            self.assertFalse((Path(directory) / "journal.json").exists())
            self.assertEqual(p.emit.call_args.kwargs["state"], "not_created")

    def test_cache_wait_overlaps_native_stability_instead_of_restarting_it(self):
        with tempfile.TemporaryDirectory() as directory:
            p = self.make(directory); p.tick()
            self.time += 1100000000
            self.marker(p, "prime"); p.tick()
            self.assertEqual(p.stage, "settle")
            p.tick()
            self.assertEqual(p.stage, "measure")

    def test_recovery_requires_fresh_native_sequence(self):
        with tempfile.TemporaryDirectory() as directory:
            p = self.make(directory)
            p.phase, p.stage, p.target_sequence = "recovery", "target", 1
            p.tick(); self.assertEqual(p.stage, "target")
            self.slot.owner.last_observation = (self.body, self.time, 2)
            p.tick(); self.assertEqual(p.stage, "prime")

    def test_action_deadline_includes_dispatch_call_time(self):
        with tempfile.TemporaryDirectory() as directory:
            p = self.make(directory)
            p.stage, p.identities = "measure", {"first": "owned"}
            self.time = 3100000000
            def dispatch(*_):
                self.time += 200000000
                return p.operation
            p.local.dispatch.side_effect = dispatch
            self.marker(p, "phase"); p.tick()
            self.assertEqual(p.dispatched_at, 3100000000)
            self.assertEqual(self.time, 3300000000)
