"""Receiver proof must fail closed; native trials opt in to disposable workers only."""

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from live_probe_control.controller import CadenceController
from live_probe_control.webrtc_worker import (
    MAX_GAP_NS,
    MAX_SILENCE_NS,
    MAX_TIMELINE,
    POLICY,
    ReceiverProgress,
    WebRTCPort,
    exact_fps,
    rate_met,
)


class ReceiverProofTests(unittest.TestCase):
    def test_importable_port_cannot_claim_dedicated_process(self):
        self.assertIs(WebRTCPort.dedicated_process, False)

    def test_freshness_requires_multiple_frames_and_expires(self):
        progress = ReceiverProgress()
        self.assertFalse(progress.healthy(0))
        progress.observe(0, 0)
        self.assertFalse(progress.healthy(0))
        progress.observe(33000000, 33000000)
        self.assertTrue(progress.healthy(33000000 + MAX_SILENCE_NS))
        self.assertFalse(progress.healthy(33000001 + MAX_SILENCE_NS))
        self.assertFalse(progress.healthy(0))

    def test_bad_sequence_permanently_invalidates_proof(self):
        for pts, now in ((0, 1), (MAX_GAP_NS + 1, 1), (1, MAX_SILENCE_NS + 1), (1, -1)):
            with self.subTest(pts=pts, now=now):
                progress = ReceiverProgress()
                progress.observe(0, 0)
                if now < 0:
                    with self.assertRaises(ValueError):
                        progress.observe(pts, now)
                else:
                    progress.observe(pts, now)
                    progress.observe(pts + 1, now + 1)
                    self.assertFalse(progress.healthy(now + 1))

    def test_evidence_is_bounded_and_exactly_typed(self):
        progress = ReceiverProgress()
        for i in range(MAX_TIMELINE):
            progress.observe(i, i)
        with self.assertRaises(ValueError):
            progress.observe(MAX_TIMELINE, MAX_TIMELINE)
        for pts, now in ((True, 1), (1, 1.5), (-1, 1)):
            with self.assertRaises(ValueError):
                ReceiverProgress().observe(pts, now)

    def test_rate_tolerance_uses_exact_inclusive_arithmetic(self):
        self.assertTrue(rate_met(27, 1000000000, 30))
        self.assertTrue(rate_met(33, 1000000000, 30))
        self.assertFalse(rate_met(26, 1000000000, 30))
        self.assertFalse(rate_met(34, 1000000000, 30))
        self.assertFalse(rate_met(30, 0, 30))

    def test_fractional_or_wrong_dimension_caps_rejected(self):
        class Fields:
            fps = (True, 30, 1)
            width = 640

            def get_fraction(self, _):
                return self.fps

            def get_value(self, name):
                return self.width if name == "width" else 360

        class Caps:
            def get_size(self):
                return 1

            def get_structure(self, _):
                return fields

        fields = Fields()
        self.assertEqual(exact_fps(Caps()), 30)
        for value in ((True, 30000, 1001), (False, 30, 1), (True, 15, 1)):
            fields.fps = value
            with self.assertRaises(ValueError):
                exact_fps(Caps())
        fields.fps = (True, 30, 1)
        fields.width = 1280
        with self.assertRaises(ValueError):
            exact_fps(Caps())


@unittest.skipUnless(
    sys.platform == "linux" and os.environ.get("N10_NATIVE_WEBRTC_TESTS") == "1",
    "explicit isolated Linux WebRTC trial required",
)
class NativeWebRTCWorkerTests(unittest.TestCase):
    def run_worker(self, option, recover=False):
        with tempfile.TemporaryDirectory() as directory:
            result = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "live_probe_control.webrtc_worker",
                    option,
                    "--state-directory",
                    directory,
                ],
                cwd=Path(__file__).resolve().parents[2],
                check=False,
                capture_output=True,
                text=True,
                timeout=23,
            )
            report = json.loads(result.stdout)
            journal = json.loads((Path(directory) / "journal.json").read_text())
            if recover:
                # Recovery only proves the dead native lifetime; no new media or setter.
                with CadenceController(
                    directory,
                    POLICY,
                    SimpleNamespace(dedicated_process=True),
                    enabled=True,
                ) as controller:
                    self.assertTrue(controller.recover_after_teardown())
                    recovered = controller.store.journal
                    self.assertEqual(recovered["state"], "clean")
                    self.assertEqual(recovered["actions"], journal["actions"])
                    self.assertEqual(recovered["reserved_ns"], journal["reserved_ns"])
                    row = recovered["history"][0]["result"]
                    self.assertEqual(row["outcome"], "interrupted_teardown")
                    self.assertEqual(row["restoration"], "not_verified_teardown")
            return result, report, journal

    def test_real_webrtc_controller_restores_source_and_receiver(self):
        result, report, journal = self.run_worker("--isolated-webrtc-trial")
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        self.assertEqual(report["result"]["outcome"], "completed")
        self.assertEqual(report["assessment"]["status"], "met")
        self.assertEqual(report["teardown"], "null_observed")
        self.assertEqual(journal["state"], "clean")
        self.assertFalse(report["live_authority"])

    def test_real_cancel_restores_without_completing_request(self):
        result, report, journal = self.run_worker("--isolated-webrtc-cancel")
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        self.assertEqual(report["result"]["reason"], "cancelled")
        self.assertEqual(report["result"]["restoration"], "verified_by_port")
        self.assertEqual(journal["state"], "clean")

    def test_receiver_loss_retains_dirty_intent_and_watchdog_kills_worker(self):
        result, report, journal = self.run_worker(
            "--isolated-webrtc-disconnect", recover=True
        )
        self.assertEqual(result.returncode, -9, result.stderr + result.stdout)
        self.assertEqual(report["status"], "unavailable")
        self.assertEqual(report["result"]["restoration"], "unknown")
        self.assertEqual(journal["state"], "dirty")
        self.assertEqual(journal["actions"], 1)
        self.assertEqual(journal["reserved_ns"], 5000000000)


if __name__ == "__main__":
    unittest.main()
