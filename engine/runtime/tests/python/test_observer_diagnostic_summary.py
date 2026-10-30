"""Static diagnostic can describe a controlled case, never substitute for qualification."""

import copy
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from live_probe_control.observer_diagnostic import summarize
from live_probe_control.observer_screen import browser_screen
from test_observer_screen import cohort


def diagnostic():
    base = cohort()[0]
    run = {"mode": "observer-static-diagnostic", "status": "passed", "live_authority": False,
           "role": "exploratory_static_scene_not_qualification", "context": base["context"], "browser": base["browser"],
           "events": [{"kind": "camera_ready", "source": "production", "mode": "observer-static-diagnostic"}, base["events"][-1]],
           "diagnostic_windows": [], "startup": []}
    for phase in ("on-1", "off", "on-2"):
        native = copy.deepcopy(base["events"][1])
        native.update(kind="diagnostic_native", phase=phase, game_frozen=True,
                      worker_identities={peer: ("a" if peer == "first" else "b") * 64 for peer in ("first", "second")},
                      private_sequences={"first": 4, "second": 4})
        for sample in native["samples"]:
            sample["game"]["cpu_ticks"] = 100
        quality = copy.deepcopy(base["quality"])
        for view in quality:
            for sample in view["visuals"]:
                sample["hash"] = 1
        run["events"].append(native)
        run["diagnostic_windows"].append({"phase": phase, "quality": quality, "browser_resources": copy.deepcopy(base["browser_resources"])})
    marks = {"eligible": {"at_ns": 1}, "game_frozen": {"at_ns": 3000000001}}
    for peer in ("first", "second"):
        for suffix in ("_native_connected", "_bound", "_first_report", "_ready"):
            marks[peer + suffix] = {"at_ns": 0}
        run["startup"].append({"basis": "page_performance_ms_no_native_alignment", "timelines": {peer: {name: {"at_ms": i * 10} for i, name in enumerate(("created", "local_offer", "remote_answer", "connected", "video_track", "first_presented", "first_report"))}}})
    run["events"].append({"kind": "diagnostic_trace", "basis": "camera_host_detection_monotonic_relative_ns_no_browser_alignment", "marks": marks})
    return run


class DiagnosticSummaryTests(unittest.TestCase):
    def test_static_scene_only_passes_exploratory_description(self):
        run = diagnostic()
        result = summarize(run)
        self.assertEqual(result["diagnostic_state"], "observed")
        self.assertFalse(result["live_authority"])
        self.assertEqual(result["qualification"], "unavailable_exploratory_static_scene")
        self.assertFalse(browser_screen(run["diagnostic_windows"][0]["quality"][0])["met"])

    def test_identity_change_private_commands_or_game_progress_is_unavailable(self):
        for field, value in (("worker_identities", {"first": "c" * 64, "second": "b" * 64}), ("private_sequences", {"first": 5, "second": 4}), ("game_frozen", False)):
            run = diagnostic()
            run["events"][3][field] = value
            self.assertEqual(summarize(run)["diagnostic_state"], "unavailable")
        run = diagnostic()
        run["events"][3]["samples"][-1]["game"]["cpu_ticks"] = 101
        self.assertEqual(summarize(run)["diagnostic_state"], "unavailable")

    def test_missing_startup_trace_unknown_cleanup_and_reset_stats_do_not_describe_success(self):
        run = diagnostic(); run["startup"] = []
        self.assertEqual(summarize(run)["diagnostic_state"], "unavailable")
        run = diagnostic(); run["events"][1]["worker_cleanup"] = False
        self.assertEqual(summarize(run)["diagnostic_state"], "unavailable")
        run = diagnostic(); run["diagnostic_windows"][1]["quality"][0]["stats"][5]["decoded"] = 0
        self.assertEqual(summarize(run)["diagnostic_state"], "unavailable")

    def test_missing_window_and_changed_browser_inventory_are_unavailable(self):
        run = diagnostic(); run["diagnostic_windows"].pop()
        self.assertEqual(summarize(run)["diagnostic_state"], "unavailable")
        run = diagnostic(); run["diagnostic_windows"][1]["browser_resources"]["after"]["inventory_hash"] = "changed"
        self.assertEqual(summarize(run)["diagnostic_state"], "unavailable")
