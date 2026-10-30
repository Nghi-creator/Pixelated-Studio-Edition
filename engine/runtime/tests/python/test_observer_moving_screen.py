"""Counterexamples for the independent moving cohort and unchanged original screen."""

import copy
import unittest

from live_probe_control.observer_moving_screen import ACQUISITION, ORDER, assess
from live_probe_control.observer_screen import assess as assess_original
from test_observer_screen import cohort


def moving_cohort():
    runs = cohort()
    for run, mode in zip(runs, ORDER, strict=True):
        run.update(mode=mode, method=ACQUISITION, role="moving_acquisition_not_qualification")
        run["events"][0]["mode"] = mode
        phases = [{"label": label, "at_ns": age + 100, "script_age_ns": age,
                   "game_age_ns": age + 3000000000, "script_actions": count}
                  for label, age, count in (("eligible", 0, 0), ("window_start", 3000000000, 8), ("window_end", 7500000000, 19))]
        run["events"] += [{"kind": kind, "method": ACQUISITION, **phase}
                          for kind, phase in zip(("moving_eligible", "moving_window"), phases[:2], strict=True)]
        run["events"].append({"kind": "moving_phase", "method": ACQUISITION,
                              "basis": "camera_host_monotonic_no_browser_alignment", "source_content_matched": False, "phases": phases})
        for index, sample in enumerate(run["events"][1]["samples"]):
            age = 3000000000 + index * 250000000
            sample["game_phase"] = {"script_age_ns": age, "game_age_ns": age + 3000000000,
                                    "script_actions": age // 400000000 + 1}
        run["startup"] = [{"basis": "page_performance_ms_no_native_alignment", "timelines": {
            peer: {"connected": {"at_ms": 10}, "first_presented": {"at_ms": 30, "presented": 1}}}}
            for peer in ("first", "second")]
    return runs


class MovingScreenTests(unittest.TestCase):
    def test_complete_cohort_passes_only_fixed_engineering_screen(self):
        result = assess(moving_cohort())
        self.assertEqual(result["observer_screen"], "met")
        self.assertFalse(result["live_authority"])
        self.assertFalse(result["source_content_matched"])
        self.assertEqual(result["causal_observer_effect"], "not_established")
        self.assertEqual(result["qualification"], "unavailable_engineering_only")
        self.assertEqual(result["perceptual_quality"], "not_evaluated")

    def test_original_and_moving_cohorts_cannot_substitute_for_each_other(self):
        self.assertEqual(assess(cohort())["observer_screen"], "unavailable")
        self.assertEqual(assess_original(moving_cohort())["observer_screen"], "unavailable")

    def test_missing_phase_trace_or_fabricated_content_match_is_unavailable(self):
        for key, value in (("phases", []), ("source_content_matched", True), ("basis", "aligned")):
            runs = moving_cohort()
            runs[0]["events"][-1][key] = value
            result = assess(runs)
            self.assertEqual(result["observer_screen"], "unavailable")
            self.assertIsNone(result["pairs"][0]["increases"])
            self.assertEqual(result["runs"][-1]["state"], "measured")

    def test_paired_game_phase_gap_is_missingness_not_zero_cost(self):
        runs = moving_cohort()
        row = runs[1]
        for event in row["events"]:
            if event["kind"] in ("moving_eligible", "moving_window"):
                event["game_age_ns"] += 200000000
            elif event["kind"] == "moving_phase":
                for phase in event["phases"]:
                    phase["game_age_ns"] += 200000000
            elif event["kind"] == "screen_native":
                for sample in event["samples"]:
                    sample["game_phase"]["game_age_ns"] += 200000000
        result = assess(runs)
        self.assertEqual(result["runs"][1]["state"], "measured")
        self.assertEqual(result["observer_screen"], "unavailable")
        self.assertIsNone(result["pairs"][0]["met"])
        self.assertIn("phase difference", result["pairs"][0]["reason"])
        self.assertTrue(result["pairs"][1]["met"])

    def test_stalled_script_fractional_counter_or_clock_jump_cannot_pass(self):
        for key, value in (("script_actions", 1), ("script_age_ns", 3500000000.5), ("game_age_ns", 9999999999)):
            runs = moving_cohort()
            runs[2]["events"][1]["samples"][5]["game_phase"][key] = value
            self.assertEqual(assess(runs)["observer_screen"], "unavailable")

    def test_duplicate_browser_scope_and_late_startup_fail(self):
        runs = moving_cohort()
        runs[0]["startup"][1] = copy.deepcopy(runs[0]["startup"][0])
        self.assertEqual(assess(runs)["observer_screen"], "unavailable")
        runs = moving_cohort()
        runs[0]["startup"][0]["timelines"]["first"]["first_presented"]["at_ms"] = 1011
        self.assertEqual(assess(runs)["observer_screen"], "unavailable")

    def test_same_resource_breach_still_blocks_and_later_rows_are_retained(self):
        runs = moving_cohort()
        for index, sample in enumerate(runs[1]["events"][1]["samples"]):
            sample["workers"]["first"]["cpu_ticks"] += index * 3
        result = assess(runs)
        self.assertEqual(result["observer_screen"], "not_met")
        self.assertFalse(result["pairs"][0]["met"])
        self.assertEqual(len(result["runs"]), 6)

    def test_failed_or_mixed_context_case_stays_unavailable(self):
        runs = moving_cohort()
        runs[0] = {"mode": ORDER[0], "status": "failed", "failure": "container timeout", "live_authority": False}
        result = assess(runs)
        self.assertEqual(result["observer_screen"], "unavailable")
        self.assertIn("incomplete acquisition: container timeout", result["runs"][0]["reason"])
        self.assertEqual(len(result["runs"]), 6)
        for field, value in (("status", "failed"), ("role", "moving_acquisition_rehearsal_not_qualification")):
            runs = moving_cohort()
            runs[0][field] = value
            self.assertEqual(assess(runs)["observer_screen"], "unavailable")
        runs = moving_cohort()
        runs[3]["context"]["software_hash"] = "c" * 64
        self.assertEqual(assess(runs)["observer_screen"], "unavailable")
