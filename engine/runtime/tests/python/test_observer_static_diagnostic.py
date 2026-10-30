"""Exact owned-game targeting and fail-closed exploratory diagnostic lifecycle."""

import signal
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

SCRIPTS = Path(__file__).resolve().parents[2] / "scripts" / "n10"
sys.path.insert(0, str(SCRIPTS))
from observer_static_diagnostic import ObserverStaticDiagnostic


class DiagnosticTests(unittest.TestCase):
    def make(self):
        scene = SimpleNamespace(game=SimpleNamespace(pid=47, poll=lambda: None), started=0, sent=2)
        return ObserverStaticDiagnostic(SimpleNamespace(active={}), scene, SimpleNamespace(records={}), Mock(), object(), Mock(), Mock())

    def test_freeze_and_finally_resume_select_only_owned_game_pidfd(self):
        diagnostic = self.make()
        diagnostic.stage, diagnostic.stage_start = "warmup", 0
        with (
            patch.object(diagnostic, "workers", return_value={"first": object(), "second": object()}),
            patch.object(diagnostic, "ready", return_value=True),
            patch("observer_static_diagnostic.time.monotonic_ns", return_value=3000000001),
            patch("observer_static_diagnostic.os.pidfd_open", return_value=99, create=True) as opened,
            patch("observer_static_diagnostic.signal.pidfd_send_signal", create=True) as sent,
            patch("observer_static_diagnostic.os.close") as closed,
        ):
            self.assertFalse(diagnostic.tick())
            self.assertTrue(diagnostic.frozen)
            opened.assert_called_once_with(47)
            sent.assert_called_once_with(99, signal.SIGSTOP)
            diagnostic.close()
            diagnostic.close()
            self.assertEqual(sent.call_args_list[-1].args, (99, signal.SIGCONT))
            self.assertEqual(sent.call_count, 2)
            closed.assert_called_once_with(99)

    def test_eligibility_deadline_does_not_start_or_freeze_unready_game(self):
        diagnostic = self.make()
        with (
            patch("observer_static_diagnostic.time.monotonic_ns", return_value=diagnostic.origin + 8000000001),
            patch("observer_static_diagnostic.os.pidfd_open", create=True) as opened,
        ):
            with self.assertRaisesRegex(ValueError, "eligibility deadline"):
                diagnostic.tick()
            opened.assert_not_called()

    def test_changed_private_commands_fail_before_sampling(self):
        diagnostic = self.make()
        slots = {peer: SimpleNamespace(token=peer, sdp="offer", owner=SimpleNamespace(generation="generation", sequence=2)) for peer in ("first", "second")}
        diagnostic.stage = "measure"
        diagnostic.identities = diagnostic.identity(slots)
        diagnostic.sequence = {peer: 1 for peer in slots}
        diagnostic.sampler = Mock()
        with patch.object(diagnostic, "workers", return_value=slots), self.assertRaisesRegex(ValueError, "new private commands"):
            diagnostic.tick()
        diagnostic.sampler.sample.assert_not_called()

    def test_off_window_rejects_continuing_reports(self):
        diagnostic = self.make()
        slots = {peer: SimpleNamespace(token=peer, sdp="offer", owner=SimpleNamespace(generation="generation", sequence=2)) for peer in ("first", "second")}
        diagnostic.stage, diagnostic.index = "measure", 1
        diagnostic.identities, diagnostic.sequence = diagnostic.identity(slots), diagnostic.sequences(slots)
        diagnostic.off_samples = {peer: "old" for peer in slots}
        diagnostic.bridge.records = {peer: SimpleNamespace(sample="new") for peer in slots}
        with patch.object(diagnostic, "workers", return_value=slots), self.assertRaisesRegex(ValueError, "still receiving"):
            diagnostic.tick()
