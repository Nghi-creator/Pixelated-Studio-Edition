"""Invented costs and cleanup receipts; no live budget or execution authentication."""

import unittest
from test_action_span import acquisition
from live_probe_control.full_span_cohort import assess
from live_probe_control.container_cost_screen import (
    summarize as container_screen,
    METHOD,
)


def container_events(index=0, action=False):
    stamp = index * 30000000000
    return [
        dict(
            kind="container_cost_started",
            method=METHOD,
            live_authority=False,
            sample=dict(
                read_start_ns=stamp,
                read_end_ns=stamp + 1000,
                usage_usec=100,
                user_usec=50,
                system_usec=50,
            ),
        ),
        dict(kind="host_shutdown", stage="scene_closed"),
        dict(
            kind="container_cost_finished",
            method=METHOD,
            live_authority=False,
            sample=dict(
                read_start_ns=stamp + 20000000000,
                read_end_ns=stamp + 20000001000,
                usage_usec=1000100 + (100000 if action else 0),
                user_usec=500050,
                system_usec=500050,
            ),
            failure=None,
            scene_closed=True,
            pulse_reaped=True,
            workers_closed=True,
            active_peers=0,
            scope="camera_ready_through_cleanup_callbacks",
            excluded_tail="relay_interpreter_container_and_browser_exit",
        ),
    ]


def cohort():
    rows = []
    for i, condition in enumerate(
        ("unchanged", "action", "action", "unchanged", "unchanged", "action")
    ):
        # Use the existing honest unchanged phase fixture, with span checkpoints attached.
        from test_action_cost_screen import acquisition_v2
        from live_probe_control.action_cost_protocol import METHOD_V3

        phase = acquisition_v2(condition)
        base = acquisition()
        phase["mode"] = "engineering-game-" + condition + "-span"
        phase["method"] = METHOD_V3
        for e in phase["events"]:
            if "method" in e:
                e["method"] = METHOD_V3
            if e["kind"] == "camera_ready":
                e["mode"] = phase["mode"]
            if e["kind"] == "control_capture_bound":
                e["binding_hash"] = format(i + 1, "064x")
            if e["kind"] == "control_native":
                e["worker_identities"] = {
                    "first": format(20 + 2 * i, "064x"),
                    "second": format(21 + 2 * i, "064x"),
                }
                for sample in e["samples"]:
                    sample["read_start_ns"] += i * 30000000000
                    sample["read_end_ns"] += i * 30000000000
        span = [e for e in base["events"] if e["kind"].startswith("cost_span_")]
        for e in span:
            if e["kind"] == "cost_span_sample":
                e["read_start_ns"] += i * 30000000000
                e["read_end_ns"] += i * 30000000000
                if condition == "action":
                    e["actors"]["parent"]["cpu_ticks"] *= 2
        phase["events"] = (
            span + phase["events"] + container_events(i, condition == "action")
        )
        phase["browser_cost_span"] = base["browser_cost_span"]
        rows.append(phase)
    return rows


class FullSpanTests(unittest.TestCase):
    def test_signed_costs_all_pairs_keep_clocks_and_limits_separate(self):
        s = assess(cohort())
        self.assertEqual(s["comparison_screen"], "met", s)
        for pair in s["full_span_pairs"]:
            self.assertTrue(pair["comparable"])
            self.assertAlmostEqual(
                pair["deltas"]["native"]["parent"]["cpu_seconds"], 0.54
            )
            self.assertAlmostEqual(pair["deltas"]["container"]["usage_seconds"], 0.1)
        self.assertFalse(s["live_authority"])
        self.assertEqual(s["total_system_or_failure_cleanup_cost"], "unavailable")

    def test_missing_cleanup_and_browser_duration_mismatch_do_not_get_deltas(self):
        for kind in ("cleanup", "duration"):
            runs = cohort()
            if kind == "cleanup":
                runs[1]["events"] = [
                    e
                    for e in runs[1]["events"]
                    if e["kind"] != "container_cost_finished"
                ]
            else:
                runs[1]["browser_cost_span"]["after"]["host_at_ns"] += 200000000
            s = assess(runs)
            self.assertEqual(s["comparison_screen"], "unavailable")
            self.assertIsNone(s["full_span_pairs"][0]["deltas"])
            self.assertTrue(s["full_span_pairs"][1]["comparable"])

    def test_container_cpu_missing_counter_reset_and_uncertain_cleanup_stay_unavailable(
        self,
    ):
        for kind in ("reset", "closed", "tail", "missing"):
            es = container_events()
            end = es[-1]
            if kind == "reset":
                end["sample"]["usage_usec"] = 0
            elif kind == "closed":
                end["pulse_reaped"] = False
            elif kind == "tail":
                end["excluded_tail"] = "none"
            else:
                es.pop()
            self.assertEqual(container_screen(dict(events=es))["screen"], "unavailable")


def with_action_boundaries(runs):
    for run in runs:
        native = [e for e in run["events"] if e["kind"] == "cost_span_sample"]
        first, last = native[0]["read_start_ns"], native[-1]["read_start_ns"]
        run["events"] = [
            dict(
                kind="container_action_cost_started",
                method="n10-private-container-action-cpu-v1",
                live_authority=False,
                sample=dict(
                    read_start_ns=first,
                    read_end_ns=first + 1000,
                    usage_usec=100,
                    user_usec=50,
                    system_usec=50,
                ),
            ),
            *run["events"],
            dict(
                kind="container_action_cost_finished",
                method="n10-private-container-action-cpu-v1",
                live_authority=False,
                sample=dict(
                    read_start_ns=last,
                    read_end_ns=last + 1000,
                    usage_usec=1000100,
                    user_usec=500050,
                    system_usec=500050,
                ),
                failure=None,
                outcome="completed",
                scope="baseline_through_restored_end_or_failure_prefix",
                excluded_tail="startup_warmup_and_cleanup",
            ),
        ]
    return runs


class FixedActionContainerTests(unittest.TestCase):
    def test_fixed_action_comparison_keeps_variable_cleanup_costs_separate(self):
        from live_probe_control.full_span_cohort_v2 import assess as fixed_assess

        runs = with_action_boundaries(cohort())
        end = next(
            e for e in runs[1]["events"] if e["kind"] == "container_cost_finished"
        )
        end["sample"]["read_start_ns"] += 400000000
        end["sample"]["read_end_ns"] += 400000000
        self.assertEqual(assess(runs)["comparison_screen"], "unavailable")
        fixed = fixed_assess(runs)
        self.assertEqual(fixed["comparison_screen"], "met", fixed)
        self.assertEqual(fixed["runs"][1]["container_cleanup_cpu"]["screen"], "met")

    def test_old_records_and_displaced_action_checkpoint_cannot_be_promoted(self):
        from live_probe_control.full_span_cohort_v2 import assess as fixed_assess

        self.assertEqual(fixed_assess(cohort())["comparison_screen"], "unavailable")
        runs = with_action_boundaries(cohort())
        end = next(
            e
            for e in runs[1]["events"]
            if e["kind"] == "container_action_cost_finished"
        )
        end["sample"]["read_start_ns"] += 100000000
        end["sample"]["read_end_ns"] += 100000000
        result = fixed_assess(runs)
        self.assertEqual(result["comparison_screen"], "unavailable")
        self.assertIsNone(result["full_span_pairs"][0]["deltas"])
