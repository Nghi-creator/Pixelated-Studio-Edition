"""Presentation eligibility is bounded, one-shot, and separate from native clocks."""

import json
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

from live_probe_control.game_scene import GameScene

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts" / "n10"))
from observer_moving_gate import METHOD, MovingObserverGate


class MovingGateTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.marker = Path(self.directory.name) / "presented.json"
        self.now = 4000000000
        self.clock = patch("time.monotonic_ns", side_effect=lambda: self.now)
        self.clock.start()
        self.addCleanup(self.clock.stop)
        self.scene = GameScene(defer_script=True)
        self.scene.started = 0
        self.emit = Mock()
        self.gate = MovingObserverGate(self.scene, self.emit, marker=self.marker)

    def presented(self):
        self.marker.write_text(json.dumps({"method": METHOD, "peers": ["first", "second"]}))

    def test_no_script_before_both_browser_marker_and_native_readiness(self):
        self.assertFalse(self.gate.tick(True))
        self.presented()
        self.assertFalse(self.gate.tick(False))
        self.assertIsNone(self.scene.script_started)
        self.assertFalse(self.gate.tick(True))
        self.assertEqual(self.scene.script_started, self.now)
        self.now += 2999999999
        self.assertFalse(self.gate.tick(True))
        self.now += 1
        self.assertTrue(self.gate.tick(True))
        self.assertEqual(self.gate.report()["phases"][1]["script_age_ns"], 3000000000)
        self.assertFalse(self.gate.report()["source_content_matched"])

    def test_warmup_starts_at_actual_script_arm_not_earlier_gate_tick(self):
        self.presented()
        original_arm = self.scene.arm_script

        def delayed_arm():
            self.now += 1000000
            original_arm()

        with patch.object(self.scene, "arm_script", side_effect=delayed_arm):
            self.assertFalse(self.gate.tick(True))
        self.now = 7000000000
        self.assertFalse(self.gate.tick(True))  # Actual script age is only2.999s.
        self.now += 1000000
        self.assertTrue(self.gate.tick(True))
        self.assertEqual(self.gate.report()["phases"][1]["script_age_ns"], 3000000000)

    def test_incomplete_window_cannot_emit_a_report(self):
        with self.assertRaisesRegex(ValueError, "not started"):
            self.gate.report()

    def test_started_window_cannot_restart_and_report_is_stable(self):
        self.presented()
        self.gate.tick(True)
        self.now += 3000000000
        self.assertTrue(self.gate.tick(True))
        with self.assertRaisesRegex(ValueError, "already started"):
            self.gate.tick(True)
        report = self.gate.report()
        self.now += 1000000000
        self.assertEqual(self.gate.report(), report)
        self.assertEqual(len(report["phases"]), 3)

    def test_fixed_warmup_cannot_wait_out_readiness_loss(self):
        self.presented()
        self.gate.tick(True)
        with self.assertRaisesRegex(ValueError, "readiness lost"):
            self.gate.tick(False)

    def test_missing_marker_deadline_is_not_extended(self):
        self.now += 8000000001
        with self.assertRaisesRegex(ValueError, "eligibility deadline"):
            self.gate.tick(True)
        self.assertIsNone(self.scene.script_started)

    def test_wrong_or_duplicate_marker_and_size_fail_closed(self):
        for body in ('{"method":"other"}', '{"method":"x","method":"x"}', "x" * 4097):
            self.marker.write_text(body)
            with self.assertRaises(ValueError):
                self.gate.tick(True)
            self.assertIsNone(self.scene.script_started)

    def test_deferred_script_tick_stays_idle_and_cannot_rearm(self):
        self.scene.game = self.scene.display = SimpleNamespace(poll=lambda: None)
        self.scene._key = Mock()
        self.scene.tick()
        self.scene._key.assert_not_called()
        self.scene.arm_script()
        self.scene.tick()
        self.scene._key.assert_called_once_with(b"Up", 1)
        self.assertEqual(self.scene.sent, 1)
        with self.assertRaisesRegex(ValueError, "already armed"):
            self.scene.arm_script()

    def test_arm_requires_fixed_load_interval_and_explicit_deferred_mode(self):
        self.now = 2999999999
        with self.assertRaisesRegex(ValueError, "load interval"):
            self.scene.arm_script()
        with self.assertRaisesRegex(ValueError, "already armed"):
            GameScene().arm_script()
