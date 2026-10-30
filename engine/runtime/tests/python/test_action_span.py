"""Invented counters exercise units, missingness and retained prefixes only."""

import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts/n10"))
from action_span import NativeCostSpan
from live_probe_control.action_span_screen import ACTORS, EXCLUDED, METHOD, summarize
from live_probe_control.action_cost_protocol import METHOD_V3
from test_action_cost_screen import acquisition_v2


def acquisition():
    run = acquisition_v2("action")
    run["mode"], run["method"] = "engineering-game-action-span", METHOD_V3
    for e in run["events"]:
        if "method" in e:
            e["method"] = METHOD_V3
        if e["kind"] == "camera_ready":
            e["mode"] = run["mode"]
    samples = [
        dict(
            kind="cost_span_sample",
            method=METHOD,
            sequence=i,
            read_start_ns=i * 250000000,
            read_end_ns=i * 250000000 + 1000,
            game_phase=dict(script_age_ns=3000000000 + i * 250000000),
            actors={a: dict(cpu_ticks=i, rss_bytes=1024) for a in ACTORS},
            missing={},
            live_authority=False,
        )
        for i in range(55)
    ]
    run["events"] = [
        dict(
            kind="cost_span_started",
            method=METHOD,
            excluded_cost_scopes=EXCLUDED.copy(),
            live_authority=False,
        ),
        *samples,
        dict(
            kind="cost_span_finished",
            method=METHOD,
            outcome="completed",
            sample_count=55,
            ticks_per_second=100,
            excluded_cost_scopes=EXCLUDED.copy(),
            live_authority=False,
        ),
        *run["events"],
    ]
    run["browser_cost_span"] = dict(
        method="n10-browser-cost-span-v1",
        basis="host_hrtime_browser_owned_process_cpu_separate_clock",
        outcome="completed",
        failure=None,
        before=dict(
            inventory_hash="inventory", process_count=3, host_at_ns=0, cpu_seconds=1
        ),
        after=dict(
            inventory_hash="inventory",
            process_count=3,
            host_at_ns=13500000000,
            cpu_seconds=2.35,
        ),
    )
    return run


class SpanTests(unittest.TestCase):
    def test_units_and_exclusions_never_grant_cost_acceptance(self):
        s = summarize(acquisition())
        self.assertEqual(s["control_screen"], "met", s)
        self.assertAlmostEqual(s["native_costs"]["parent"]["cpu_seconds"], 0.54)
        self.assertAlmostEqual(s["native_costs"]["parent"]["cpu_percent"], 4)
        self.assertAlmostEqual(s["browser_cpu_percent"], 10)
        self.assertEqual(s["cost_limits"], "not_evaluated")
        self.assertFalse(s["live_authority"])

    def test_missing_actor_reset_gap_inventory_and_absent_end_are_unavailable(self):
        for mutation in ("missing", "reset", "gap", "inventory", "end"):
            run = acquisition()
            samples = [e for e in run["events"] if e["kind"] == "cost_span_sample"]
            if mutation == "missing":
                samples[4]["missing"] = {"pulse": "exited"}
                samples[4]["actors"]["pulse"] = None
            elif mutation == "reset":
                samples[5]["actors"]["first"]["cpu_ticks"] = 0
            elif mutation == "gap":
                samples[4]["read_start_ns"] += 600000000
            elif mutation == "inventory":
                run["browser_cost_span"]["after"]["inventory_hash"] = "changed"
            else:
                run["events"] = [
                    e for e in run["events"] if e["kind"] != "cost_span_finished"
                ]
            self.assertEqual(summarize(run)["control_screen"], "unavailable", mutation)

    def test_failed_attempt_remains_a_prefix(self):
        run = acquisition()
        run["status"] = "failed"
        next(e for e in run["events"] if e["kind"] == "cost_span_finished")[
            "outcome"
        ] = "failed_prefix"
        run["browser_cost_span"]["outcome"] = "failed_prefix"
        s = summarize(dict(status="failed", live_authority=False, acquisition=run))
        self.assertEqual(s["control_screen"], "partial_failure_prefix", s)
        self.assertEqual(s["total_system_or_failure_cleanup_cost"], "unavailable")

    def test_checkpoint_missing_worker_and_idempotent_finish(self):
        now = [1000000000]
        events = []
        service = SimpleNamespace(
            active={
                p: SimpleNamespace(owner=SimpleNamespace(child=object()))
                for p in ("first", "second")
            }
        )
        scene = SimpleNamespace(
            resources=lambda: dict(cpu_ticks=1, rss_bytes=2),
            phase=lambda: dict(script_age_ns=now[0]),
        )
        with (
            patch("action_span.time.monotonic_ns", side_effect=lambda: now[0]),
            patch(
                "action_span.NativeScreen.process",
                return_value=dict(cpu_ticks=1, rss_bytes=2),
            ),
        ):
            span = NativeCostSpan(
                service,
                scene,
                object(),
                lambda kind, **body: events.append(dict(kind=kind, **body)),
                0,
            )
            service.active["first"].owner.child = object()
            now[0] += 250000000
            span.sample()
            span.finish("failed_prefix")
            span.finish("failed_prefix")
        samples = [e for e in events if e["kind"] == "cost_span_sample"]
        self.assertEqual(len(samples), 3)
        self.assertIsNone(samples[1]["actors"]["first"])
        self.assertEqual(samples[1]["missing"], {"first": "owned_process_unavailable"})
        self.assertEqual(sum(e["kind"] == "cost_span_finished" for e in events), 1)
