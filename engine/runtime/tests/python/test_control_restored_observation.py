"""A result must not mistake cached pre-restoration telemetry for a fresh observation."""

import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts" / "n10"))
from control_disturbance import ControlDisturbance


class RestoredObservationTests(unittest.TestCase):
    def driver(self):
        driver = ControlDisturbance.__new__(ControlDisturbance)
        driver.stage, driver.stage_start, driver.origin = "await-restored", 0, 0
        driver.identities = None
        driver.restoration_sequences = {"first": 10, "second": 10}
        slots = {
            peer: SimpleNamespace(
                owner=SimpleNamespace(
                    last_observation=(
                        dict(
                            configured_fps=24 if peer == "first" else 30,
                            negotiated_fps=24 if peer == "first" else 30,
                        ),
                        0,
                        10,
                    )
                )
            )
            for peer in ("first", "second")
        }
        driver.slots = lambda: slots
        driver.begin = MagicMock()
        return driver, slots

    def test_cached_target_is_not_a_failed_restoration_and_needs_fresh_both_peers(self):
        driver, slots = self.driver()
        with patch("control_disturbance.time.monotonic_ns", return_value=100000000):
            self.assertFalse(driver.tick())
        self.assertEqual(driver.stage, "await-restored")
        slots["first"].owner.last_observation = (
            dict(configured_fps=30, negotiated_fps=30),
            0,
            11,
        )
        with patch("control_disturbance.time.monotonic_ns", return_value=200000000):
            driver.tick()
        self.assertEqual(driver.stage, "await-restored")
        slots["second"].owner.last_observation = (
            dict(configured_fps=30, negotiated_fps=30),
            0,
            11,
        )
        with patch("control_disturbance.time.monotonic_ns", return_value=300000000):
            driver.tick()
        self.assertEqual(driver.stage, "settle-restored")
        with patch("control_disturbance.time.monotonic_ns", return_value=799999999):
            driver.tick()
        driver.begin.assert_not_called()
        with patch("control_disturbance.time.monotonic_ns", return_value=800000000):
            driver.tick()
        self.assertEqual(driver.phase, "restored")
        driver.begin.assert_called_once_with(slots)

    def test_fresh_observation_deadline_is_bounded(self):
        driver, _ = self.driver()
        with patch("control_disturbance.time.monotonic_ns", return_value=1000000001):
            with self.assertRaisesRegex(ValueError, "observation bound"):
                driver.tick()

    def test_target_loss_after_settling_begins_remains_failure(self):
        driver, _ = self.driver()
        driver.stage = "settle-restored"
        with patch("control_disturbance.time.monotonic_ns", return_value=100000000):
            with self.assertRaisesRegex(ValueError, "lost during fixed settling"):
                driver.tick()
