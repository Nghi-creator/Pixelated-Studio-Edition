"""Contained game evidence cannot substitute for synthetic or production authority."""

import unittest

from live_probe_control.control_disturbance_screen import summarize as synthetic
from live_probe_control.game_control_disturbance_screen import METHOD, summarize
from test_control_disturbance_screen import acquisition


def game_acquisition():
    run = acquisition()
    run.update(method=METHOD, role="contained_game_control_disturbance_not_qualification", mode="engineering-game-disturbance")
    for event in run["events"]:
        if "method" in event:
            event["method"] = METHOD
        if event["kind"] == "camera_ready":
            event.update(mode=run["mode"], source="isolated_game")
        if event["kind"] == "control_native":
            for index, sample in enumerate(event["samples"]):
                sample["game_phase"] = {"game_age_ns": 10000000000 + index * 250000000,
                    "script_age_ns": 7000000000 + index * 250000000, "script_actions": index + 1}
    run["events"].insert(1, {"kind": "control_capture_bound", "method": METHOD, "scope": "owned_x99_game_display",
                             "binding_hash": "d" * 64, "live_authority": False})
    return run


class GameScreenTests(unittest.TestCase):
    def test_complete_context_is_still_only_contained_temporal_engineering(self):
        result = summarize(game_acquisition())
        self.assertEqual(result["control_screen"], "met")
        self.assertFalse(result["live_authority"])
        self.assertEqual(result["qualification"], "unavailable_contained_game_engineering_only")
        self.assertEqual(result["perceptual_quality"], "not_evaluated")

    def test_synthetic_and_game_receipts_are_not_interchangeable(self):
        self.assertEqual(summarize(acquisition())["control_screen"], "unavailable")
        self.assertEqual(synthetic(game_acquisition())["control_screen"], "unavailable")

    def test_missing_binding_stalled_game_or_production_source_is_unavailable(self):
        run = game_acquisition()
        run["events"] = [e for e in run["events"] if e["kind"] != "control_capture_bound"]
        self.assertEqual(summarize(run)["control_screen"], "unavailable")
        run = game_acquisition()
        report = next(e for e in run["events"] if e["kind"] == "control_native")
        for sample in report["samples"]:
            sample["game_phase"]["script_actions"] = 1
        self.assertEqual(summarize(run)["control_screen"], "unavailable")
        run = game_acquisition()
        run["events"][0]["source"] = "production"
        self.assertEqual(summarize(run)["control_screen"], "unavailable")
