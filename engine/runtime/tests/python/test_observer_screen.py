"""Independent screen counterexamples; observer results never grant live authority."""

import copy
import io
import json
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from live_probe_control.observer_screen import ORDER, assess, main


def cohort():
    quality = {
        "basis": "browser_performance_relative_ms", "duration_ms": 4000, "failure": None, "connection_state": "connected",
        "frames": [{"at_ms": i * 1000 / 30, "pts_ms": i * 1000 / 30, "presented": i + 1, "width": 640, "height": 480} for i in range(121)],
        "stats": [{"at_ms": i * 200, "decoded": i * 6, "dropped": 0, "freezes": 0, "width": 640, "height": 480} for i in range(21)],
        "visuals": [{"at_ms": i * 500, "hash": i, "color_bins": 8} for i in range(9)],
    }
    samples = [{"read_start_ns": i * 250000000, "read_end_ns": i * 250000000 + 100000,
                "parent": {"cpu_ticks": i, "rss_bytes": 1000000},
                "relay": {"cpu_ticks": i, "rss_bytes": 1000000},
                "workers": {peer: {"cpu_ticks": i * 2, "rss_bytes": 2000000, "capture_buffers": i * 7, "encoded_buffers": i * 7} for peer in ("first", "second")},
                "game": {"cpu_ticks": i}} for i in range(19)]
    run = {"status": "passed", "live_authority": False, "browser": "test-chromium",
           "context": {"image": "sha256:" + "a" * 64, "software_hash": "b" * 64, "host_platform": "darwin", "host_arch": "arm64"},
           "events": [{"kind": "camera_ready", "source": "production"},
                      {"kind": "screen_native", "basis": "linux_monotonic_brackets_exact_owned_process_ticks", "ticks_per_second": 100, "samples": samples},
                      {"kind": "complete", "worker_cleanup": True, "game_alive": True}],
           "quality": [quality, copy.deepcopy(quality)],
           "browser_resources": {"basis": "host_hrtime_browser_owned_process_cpu_separate_clock",
                                 "before": {"host_at_ns": 10000000000, "cpu_seconds": 1, "inventory_hash": "stable", "process_count": 5},
                                 "after": {"host_at_ns": 14000000000, "cpu_seconds": 1.2, "inventory_hash": "stable", "process_count": 5}}}
    result = []
    for mode in ORDER:
        row = {**copy.deepcopy(run), "mode": mode}
        row["events"][0]["mode"] = mode
        row["viewers"] = [{"failures": 0, "unbound": 1 if mode == "observer-on" else 0} for _ in range(2)]
        result.append(row)
    return result


class ObserverScreenTests(unittest.TestCase):
    def test_complete_matched_cohort_only_passes_narrow_screen(self):
        result = assess(cohort())
        self.assertEqual(result["observer_screen"], "met")
        self.assertFalse(result["live_authority"])
        self.assertEqual(result["perceptual_quality"], "not_evaluated")
        self.assertEqual(result["qualification"], "unavailable_engineering_only")

    def test_single_failed_temporal_case_cannot_be_hidden_by_other_pairs(self):
        for field, value in (("dropped", 1), ("freezes", 1), ("width", 320)):
            runs = cohort()
            runs[2]["quality"][0]["stats"][-1][field] = value
            self.assertEqual(assess(runs)["observer_screen"], "not_met")
        runs = cohort()
        runs[4]["quality"][1]["frames"] = runs[4]["quality"][1]["frames"][::10]
        self.assertEqual(assess(runs)["observer_screen"], "not_met")

    def test_pair_overhead_limits_are_not_averaged_away(self):
        for field in ("cpu", "rss", "browser"):
            runs = cohort()
            if field == "browser":
                runs[1]["browser_resources"]["after"]["cpu_seconds"] = 2.0
            else:
                for i, sample in enumerate(runs[1]["events"][1]["samples"]):
                    sample["parent"]["cpu_ticks" if field == "cpu" else "rss_bytes"] += i * 5 if field == "cpu" else 9000000
            self.assertEqual(assess(runs)["observer_screen"], "not_met")

    def test_missing_reset_or_nonfinite_observations_are_unavailable(self):
        for value in (None, True, float("nan"), float("inf"), -1):
            runs = cohort()
            runs[0]["quality"][0]["stats"][3]["decoded"] = value
            self.assertEqual(assess(runs)["observer_screen"], "unavailable")
        runs = cohort()
        runs[0]["events"][1]["samples"][5]["parent"]["cpu_ticks"] = 0
        self.assertEqual(assess(runs)["observer_screen"], "unavailable")

    def test_reordering_omission_changed_context_and_inventory_do_not_qualify(self):
        cases = []
        runs = cohort(); runs.reverse(); cases.append(runs)
        cases.append(cohort()[:-1])
        runs = cohort(); runs[2]["context"]["software_hash"] = "changed"; cases.append(runs)
        runs = cohort(); runs[1]["browser_resources"]["after"]["inventory_hash"] = "changed"; cases.append(runs)
        runs = cohort(); runs[3]["live_authority"] = True; cases.append(runs)
        for runs in cases:
            self.assertEqual(assess(runs)["observer_screen"], "unavailable")

    def test_failed_case_retains_later_screens_without_inventing_a_pair(self):
        runs = cohort()
        runs[1] = {"mode": "observer-on", "status": "failed", "failure": "admission not ready"}
        result = assess(runs)
        self.assertEqual(result["observer_screen"], "unavailable")
        self.assertEqual(len(result["runs"]), 6)
        self.assertEqual(result["runs"][1]["state"], "unavailable")
        self.assertEqual(result["runs"][5]["state"], "measured")
        self.assertIsNone(result["pairs"][0]["met"])
        self.assertIsNone(result["pairs"][0]["increases"])
        self.assertTrue(result["pairs"][1]["met"])

    def test_exploratory_static_case_cannot_replace_a_failed_cohort_case(self):
        runs = cohort()
        runs[1]["mode"] = "observer-static-diagnostic"
        result = assess(runs)
        self.assertEqual(result["observer_screen"], "unavailable")
        self.assertFalse(result["live_authority"])

    def test_cli_does_not_report_an_incomplete_cohort_as_a_successful_gate(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "missing.json"
            path.write_text(json.dumps(cohort()[:-1]))
            with patch.object(sys, "argv", ["observer_screen", str(path)]), redirect_stdout(io.StringIO()) as output:
                self.assertEqual(main(), 1)
            self.assertEqual(json.loads(output.getvalue())["observer_screen"], "unavailable")

    def test_declared_mode_must_match_actual_camera_and_browser_lifecycle(self):
        runs = cohort()
        runs[1]["events"][0]["mode"] = "observer-off"
        self.assertEqual(assess(runs)["observer_screen"], "unavailable")
        runs = cohort()
        runs[1]["viewers"][0]["unbound"] = 0
        self.assertEqual(assess(runs)["observer_screen"], "unavailable")

    def test_unknown_cleanup_and_missing_source_proof_cannot_pass(self):
        for changes in ({"worker_cleanup": False}, {"game_alive": False}):
            runs = cohort(); runs[2]["events"][-1].update(changes)
            self.assertEqual(assess(runs)["observer_screen"], "unavailable")
        runs = cohort(); runs[0]["events"][0]["source"] = "isolated_synthetic"
        self.assertEqual(assess(runs)["observer_screen"], "unavailable")
