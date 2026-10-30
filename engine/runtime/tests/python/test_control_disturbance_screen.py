"""Controller windows and continuous transitions must agree; no qualification promotion."""

import copy
import unittest

from live_probe_control.control_disturbance_screen import METHOD, summarize
from live_probe_control.peer_protocol import PROFILE_ENCODERS
from test_observer_screen import cohort


def acquisition():
    base = cohort()[0]
    run = {**base, "mode": "engineering-disturbance", "method": METHOD,
           "role": "integrated_synthetic_control_disturbance_not_qualification", "control_windows": []}
    run["events"] = [{"kind": "camera_ready", "source": "isolated_synthetic", "mode": run["mode"]}]
    run["viewers"] = [{"failures": 0, "unbound": 1} for _ in range(2)]
    cpu, quantizer = PROFILE_ENCODERS["balanced"]
    for phase_index, phase in enumerate(("baseline", "during", "restored")):
        quality = []
        for peer in (0, 1):
            fps = 24 if phase == "during" and peer == 0 else 30
            q = copy.deepcopy(base["quality"][peer])
            q["duration_ms"] = 2000
            q["frames"] = [{"at_ms": i * 1000 / fps, "pts_ms": i * 1000 / fps, "presented": 100 * phase_index + i + 1,
                            "width": 640, "height": 480} for i in range(2 * fps + 1)]
            q["stats"] = [{"at_ms": i * 200, "decoded": phase_index * 100 + round(i * fps / 5), "dropped": 0,
                           "freezes": 0, "width": 640, "height": 480} for i in range(11)]
            q["visuals"] = [{"at_ms": i * 500, "hash": i, "color_bins": 8} for i in range(5)]
            quality.append(q)
        browser = copy.deepcopy(base["browser_resources"])
        browser["after"]["host_at_ns"] = browser["before"]["host_at_ns"] + 2000000000
        run["control_windows"].append({"phase": phase, "quality": quality, "browser_resources": browser})
        report = copy.deepcopy(base["events"][1])
        report.update(kind="control_native", phase=phase, method=METHOD,
                      worker_identities={"first": "a" * 64, "second": "b" * 64})
        report["samples"] = report["samples"][:11]
        for index, sample in enumerate(report["samples"]):
            sample["read_start_ns"] += phase_index * 10000000000
            sample["read_end_ns"] += phase_index * 10000000000
            for peer in ("first", "second"):
                fps = 24 if phase == "during" and peer == "first" else 30
                sample["workers"][peer]["settings"] = {"configured_fps": fps, "negotiated_fps": fps, "width": 640,
                    "height": 480, "target_bitrate": 1500000, "cpu_used": cpu, "max_quantizer": quantizer}
        run["events"] += [{"kind": "control_window_started", "phase": phase, "method": METHOD}, report]
        if phase == "baseline":
            run["events"].append({"kind": "control_dispatched", "method": METHOD, "live_authority": False,
                "request": {"request_id": "request", "target_fps": 24, "duration_ns": 5000000000}})
        elif phase == "during":
            run["events"].append({"kind": "control_result", "method": METHOD, "ledger_state": "clean", "actions": 1,
                "reserved_ns": 7000000000, "result": {"request_id": "request", "outcome": "completed",
                    "restoration": "verified_by_port", "reason": "duration_elapsed", "live_authority": False}})
    run["events"].append({"kind": "complete", "worker_cleanup": True, "game_alive": True})
    run["continuity"] = [{"basis": "browser_performance_relative_ms", "duration_ms": 13000, "failure": None,
        "frames": [{"at_ms": i * 1000 / 30, "pts_ms": i * 1000 / 30, "presented": i + 1, "width": 640,
                    "height": 480} for i in range(391)]} for _ in range(2)]
    return run


class ControlScreenTests(unittest.TestCase):
    def test_complete_is_only_integrated_synthetic_temporal_screen(self):
        result = summarize(acquisition())
        self.assertEqual(result["control_screen"], "met")
        self.assertFalse(result["live_authority"])
        self.assertEqual(result["qualification"], "unavailable_integrated_synthetic_only")
        self.assertEqual(result["real_game_quality"], "not_evaluated")

    def test_setter_transition_gap_blocks_even_if_all_phase_windows_pass(self):
        run = acquisition()
        run["continuity"][0]["frames"] = [f for f in run["continuity"][0]["frames"] if not 3000 < f["at_ms"] < 3400]
        self.assertEqual(summarize(run)["control_screen"], "not_met")

    def test_sibling_cadence_or_unrelated_encoder_change_cannot_pass(self):
        for key, value in (("configured_fps", 24), ("target_bitrate", 750000)):
            run = acquisition()
            native = [e for e in run["events"] if e["kind"] == "control_native"][1]
            native["samples"][3]["workers"]["second"]["settings"][key] = value
            self.assertEqual(summarize(run)["control_screen"], "unavailable")

    def test_unknown_restore_or_reset_budget_cannot_pass(self):
        for key, value in (("ledger_state", "dirty"), ("actions", 0), ("reserved_ns", 0)):
            run = acquisition()
            next(e for e in run["events"] if e["kind"] == "control_result")[key] = value
            self.assertEqual(summarize(run)["control_screen"], "unavailable")

    def test_replaced_worker_or_reordered_window_cannot_pass(self):
        run = acquisition()
        [e for e in run["events"] if e["kind"] == "control_native"][2]["worker_identities"]["first"] = "c" * 64
        self.assertEqual(summarize(run)["control_screen"], "unavailable")
        run = acquisition()
        run["control_windows"].reverse()
        self.assertEqual(summarize(run)["control_screen"], "unavailable")

    def test_drop_between_windows_missing_continuity_or_production_source_cannot_pass(self):
        run = acquisition()
        for sample in run["control_windows"][1]["quality"][0]["stats"]:
            sample["dropped"] = 1
        self.assertEqual(summarize(run)["control_screen"], "unavailable")
        run = acquisition()
        run["continuity"] = []
        self.assertEqual(summarize(run)["control_screen"], "unavailable")
        run = acquisition()
        run["events"][0]["source"] = "production"
        self.assertEqual(summarize(run)["control_screen"], "unavailable")

    def test_failed_acquisition_and_interior_counter_reset_stay_unavailable(self):
        self.assertEqual(summarize({"status": "failed"})["control_screen"], "unavailable")
        run = acquisition()
        run["control_windows"][2]["quality"][0]["stats"][6]["decoded"] = 0
        self.assertEqual(summarize(run)["control_screen"], "unavailable")
