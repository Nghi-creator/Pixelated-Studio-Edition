"""Invented independent sessions test comparison arithmetic and missingness only."""

import unittest
from live_probe_control.action_cost_cohort import ORDER, assess
from test_action_cost_screen import acquisition, acquisition_v2


def cohort(version="v1"):
    runs = []
    for index, mode in enumerate(ORDER):
        run = (acquisition_v2 if version == "v2" else acquisition)(
            "unchanged" if "unchanged" in mode else "action"
        )
        for event in run["events"]:
            if event["kind"] == "control_capture_bound":
                event["binding_hash"] = format(index + 1, "064x")
            if event["kind"] == "control_native":
                event["worker_identities"] = {
                    "first": format(20 + 2 * index, "064x"),
                    "second": format(21 + 2 * index, "064x"),
                }
                for sample in event["samples"]:
                    for key in ("read_start_ns", "read_end_ns"):
                        sample[key] += index * 30000000000
                    if run["condition"] == "action":
                        sample["parent"]["rss_bytes"] += 1024
        runs.append(run)
    return runs


def native(run):
    return [e for e in run["events"] if e["kind"] == "control_native"]


class ActionCostCohortTests(unittest.TestCase):
    def test_original_pairs_signed_phase_deltas_do_not_grant_cost_acceptance(self):
        result = assess(cohort())
        self.assertEqual(result["comparison_screen"], "met", result)
        self.assertEqual(
            [(p["unchanged"], p["action"]) for p in result["pairs"]],
            [(0, 1), (3, 2), (4, 5)],
        )
        for pair in result["pairs"]:
            self.assertTrue(pair["comparable"])
            self.assertEqual(
                [r["phase"] for r in pair["phase_deltas"]],
                ["baseline", "during", "restored"],
            )
            self.assertTrue(
                all(
                    r["action_minus_unchanged"]["parent_peak_rss"] == 1024
                    for r in pair["phase_deltas"]
                )
            )
        self.assertEqual(
            result["cost_limits"], "unavailable_not_predeclared_or_qualified"
        )
        self.assertEqual(result["total_transition_and_failure_cost"], "unavailable")
        self.assertFalse(result["live_authority"])

    def test_failure_retains_all_rows_with_only_affected_pair_null(self):
        runs = cohort()
        runs[2] = dict(status="failed", mode=ORDER[2], failure="original failure")
        result = assess(runs)
        self.assertEqual(result["comparison_screen"], "unavailable")
        self.assertEqual(len(result["runs"]), 6)
        self.assertIn("original failure", result["runs"][2]["reason"])
        self.assertIsNone(result["pairs"][1]["phase_deltas"])
        self.assertTrue(result["pairs"][0]["comparable"])
        self.assertTrue(result["pairs"][2]["comparable"])

    def test_mixed_context_is_unavailable(self):
        for key, value in (
            ("software_hash", "f" * 64),
            ("image", "sha256:" + "f" * 64),
            ("host_arch", "other"),
            ("browser", "other"),
        ):
            runs = cohort()
            (runs[1] if key == "browser" else runs[1]["context"])[key] = value
            result = assess(runs)
            self.assertEqual(result["comparison_screen"], "unavailable")
            self.assertIsNone(result["pairs"][0]["phase_deltas"])

    def test_reused_session_and_overlapping_clocks_are_rejected(self):
        for mutation in ("binding", "worker", "clock"):
            runs = cohort()
            if mutation == "binding":
                next(
                    e for e in runs[1]["events"] if e["kind"] == "control_capture_bound"
                )["binding_hash"] = format(1, "064x")
            elif mutation == "worker":
                for event in native(runs[1]):
                    event["worker_identities"]["first"] = format(20, "064x")
            else:
                for event in native(runs[1]):
                    for sample in event["samples"]:
                        sample["read_start_ns"] -= 30000000000
                        sample["read_end_ns"] -= 30000000000
            result = assess(runs)
            self.assertEqual(result["comparison_screen"], "unavailable")
            self.assertIsNone(result["pairs"][0]["phase_deltas"])

    def test_mismatched_game_age_nulls_pair_without_averaging(self):
        runs = cohort()
        for event in runs[1]["events"]:
            if "game_age_ns" in event:
                event["game_age_ns"] += 200000000
            if event["kind"] == "action_cost_schedule":
                for point in event["edges"] + event["eligibility"]:
                    point["game_age_ns"] += 200000000
            if event["kind"] == "control_native":
                for sample in event["samples"]:
                    sample["game_phase"]["game_age_ns"] += 200000000
        result = assess(runs)
        self.assertEqual(result["runs"][1]["state"], "measured", result)
        self.assertIsNone(result["pairs"][0]["phase_deltas"])
        self.assertTrue(result["pairs"][1]["comparable"])

    def test_browser_phase_lag_cannot_hide_in_valid_point_windows(self):
        runs = cohort()
        for trace in runs[1]["continuity"]:
            for frame in trace["frames"]:
                if frame["at_ms"] >= 4000:
                    frame["at_ms"] += 200
            trace["duration_ms"] += 200
        result = assess(runs)
        self.assertEqual(result["runs"][1]["state"], "measured", result)
        self.assertIsNone(result["pairs"][0]["phase_deltas"])
        self.assertIn("browser phase", result["pairs"][0]["reason"])

    def test_temporal_failure_is_distinct_from_missingness(self):
        runs = cohort()
        runs[1]["control_windows"][0]["quality"][0]["connection_state"] = "disconnected"
        result = assess(runs)
        self.assertEqual(result["comparison_screen"], "not_met", result)
        self.assertTrue(all(p["comparable"] for p in result["pairs"]))

    def test_truncation_reorder_and_old_records_cannot_pass(self):
        runs = cohort()
        for bad in (runs[:2], list(reversed(runs)), [runs[0]] * 6, None):
            self.assertEqual(assess(bad)["comparison_screen"], "unavailable")

    def test_v2_comparison_never_silently_accepts_v1_or_mixed_schedules(self):
        runs = cohort("v2")
        result = assess(runs, version="v2")
        self.assertEqual(result["comparison_screen"], "met", result)
        self.assertEqual(assess(runs)["comparison_screen"], "unavailable")
        self.assertEqual(
            assess(cohort(), version="v2")["comparison_screen"], "unavailable"
        )
        runs[1] = cohort()[1]
        self.assertEqual(assess(runs, version="v2")["comparison_screen"], "unavailable")
