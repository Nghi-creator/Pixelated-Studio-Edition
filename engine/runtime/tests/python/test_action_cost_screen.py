"""Invented acquisition arithmetic; no quality/live budget is qualified by this screen."""

import unittest

from live_probe_control.action_cost_screen import METHOD, SCHEDULE, summarize
from test_control_disturbance_screen import acquisition as original_acquisition


def phase(age, label=None):
    return {
        **({"label": label} if label else {}),
        "at_ns": age + 1000000000,
        "script_age_ns": age,
        "game_age_ns": age + 3000000000,
        "script_actions": 0 if age == 0 else age // 400000000 + 1,
    }


def acquisition(condition="unchanged"):
    run = original_acquisition()
    run.update(
        method=METHOD,
        condition=condition,
        role="contained_game_action_cost_not_qualification",
        mode="engineering-game-"
        + ("action-cost" if condition == "action" else "unchanged-cost"),
    )
    ready = {"kind": "camera_ready", "mode": run["mode"], "source": "isolated_game"}
    capture = {
        "kind": "control_capture_bound",
        "method": METHOD,
        "scope": "owned_x99_game_display",
        "binding_hash": "c" * 64,
        "live_authority": False,
    }
    eligible = [phase(0, "eligible"), phase(3000000000, "window_start")]
    run["events"] = [
        ready,
        capture,
        {"kind": "moving_eligible", "method": METHOD, **eligible[0]},
        {"kind": "moving_window", "method": METHOD, **eligible[1]},
    ]
    traces = []
    for viewer in (0, 1):
        frames = []
        for a, b, fps in (
            (0, 3000, 30),
            (3000, 8000, 24 if viewer == 0 and condition == "action" else 30),
            (8000, 14000, 30),
        ):
            for i in range(round((b - a) * fps / 1000) + (1 if b == 14000 else 0)):
                t = a + i * 1000 / fps
                frames.append(
                    dict(
                        at_ms=t,
                        pts_ms=t,
                        presented=len(frames) + 101,
                        width=640,
                        height=480,
                    )
                )
        traces.append(
            dict(
                basis="browser_performance_relative_ms",
                duration_ms=14000,
                frames=frames,
                failure=None,
            )
        )
    run["continuity"] = traces
    native_template = original_acquisition()
    reports = [e for e in native_template["events"] if e["kind"] == "control_native"]
    edges = []
    for index, name in enumerate(("baseline", "during", "restored")):
        start = SCHEDULE[name]
        if index == 1:
            req = (
                dict(
                    request_id="request",
                    generation=dict(owner="owner", pipeline="pipeline", peer="peer"),
                    target_fps=24,
                    duration_ns=5000000000,
                )
                if condition == "action"
                else None
            )
            run["events"].append(
                dict(
                    kind="action_cost_boundary",
                    method=METHOD,
                    condition=condition,
                    request=req,
                    native_sequences=dict(first=10, second=10),
                    live_authority=False,
                )
            )
            edges.append(
                {**phase(6000000000, "boundary"), "planned_script_age_ns": 6000000000}
            )
            run["events"].append(
                dict(
                    kind="action_cost_target_observed",
                    method=METHOD,
                    condition=condition,
                    target_fps=24 if condition == "action" else 30,
                    native_sequences=dict(first=11, second=11),
                    live_authority=False,
                    **phase(6200000000),
                )
            )
        if index == 2 and condition == "action":
            run["events"].append(
                dict(
                    kind="action_cost_result",
                    method=METHOD,
                    live_authority=False,
                    result=dict(
                        request_id="request",
                        outcome="completed",
                        reason="duration_elapsed",
                        restoration="verified_by_port",
                        live_authority=False,
                    ),
                    ledger_state="clean",
                    actions=1,
                    reserved_ns=7000000000,
                    **phase(11300000000),
                )
            )
            run["events"].append(
                dict(
                    kind="action_cost_restore_observed",
                    method=METHOD,
                    live_authority=False,
                    native_sequences=dict(first=30, second=30),
                    after_result_sequences=dict(first=29, second=29),
                    **phase(11500000000),
                )
            )
        edges.append({**phase(start, name + "_start"), "planned_script_age_ns": start})
        report = reports[index]
        report["method"] = METHOD
        for i, s in enumerate(report["samples"]):
            age = start + i * 250000000
            s["read_start_ns"], s["read_end_ns"] = (
                100000000000 + age,
                100000000000 + age + 100000,
            )
            s["game_phase"] = {k: v for k, v in phase(age).items() if k != "at_ns"}
            for actor in ("parent", "relay", "game"):
                s[actor]["cpu_ticks"] += index * 100
            for peer in ("first", "second"):
                fps = (
                    24
                    if condition == "action" and name == "during" and peer == "first"
                    else 30
                )
                s["workers"][peer]["settings"]["configured_fps"] = fps
                s["workers"][peer]["settings"]["negotiated_fps"] = fps
                s["workers"][peer]["cpu_ticks"] += index * 100
                for k in ("capture_buffers", "encoded_buffers"):
                    s["workers"][peer][k] += index * 500
        window = run["control_windows"][index]
        offset = (start - 3000000000) / 1000000
        for viewer, q in enumerate(window["quality"]):
            fps = (
                24 if condition == "action" and name == "during" and viewer == 0 else 30
            )
            q["frames"] = [
                {**f, "at_ms": f["at_ms"] - offset}
                for f in traces[viewer]["frames"]
                if 0 <= f["at_ms"] - offset <= 2000
            ]
            q["stats"] = [
                dict(
                    at_ms=t,
                    decoded=index * 100 + round(t * fps / 1000),
                    dropped=0,
                    freezes=0,
                    width=640,
                    height=480,
                )
                for t in range(0, 2001, 200)
            ]
        run["events"].extend(
            [dict(kind="control_window_started", phase=name, method=METHOD), report]
        )
        edges.append(
            {
                **phase(start + 2500000000, name + "_end"),
                "planned_script_age_ns": start + 2500000000,
            }
        )
    run["events"].append(
        dict(
            kind="action_cost_schedule",
            method=METHOD,
            condition=condition,
            schedule=SCHEDULE.copy(),
            edges=edges,
            eligibility=eligible,
            journal_state="absent" if condition == "unchanged" else "clean",
            actions=0 if condition == "unchanged" else 1,
            reserved_ns=0 if condition == "unchanged" else 7000000000,
            source_content_matched=False,
            unmeasured_cost_scopes=[
                "pulse",
                "lease_guard",
                "watchdog_child",
                "startup",
            ],
            live_authority=False,
        )
    )
    run["events"].append(
        dict(
            kind="complete", worker_cleanup=True, game_alive=True, live_authority=False
        )
    )
    run["viewers"] = [dict(failures=0, bindings=1, unbound=1) for _ in range(2)]
    return run


class ActionCostScreenTests(unittest.TestCase):
    def test_both_conditions_are_only_acquisition_screens_with_explicit_cost_gaps(self):
        for condition in ("unchanged", "action"):
            r = summarize(acquisition(condition))
            self.assertEqual(r["control_screen"], "met", r)
            self.assertEqual(r["action_cost_budget"], "not_evaluated")
            self.assertFalse(r["live_authority"])
            self.assertEqual(r["causal_action_effect"], "not_established")

    def test_unchanged_cannot_fabricate_request_result_or_reservation(self):
        for field, value in (
            ("actions", 1),
            ("reserved_ns", 7000000000),
            ("journal_state", "clean"),
        ):
            run = acquisition()
            next(e for e in run["events"] if e["kind"] == "action_cost_schedule")[
                field
            ] = value
            self.assertEqual(summarize(run)["control_screen"], "unavailable")
        run = acquisition()
        next(e for e in run["events"] if e["kind"] == "action_cost_boundary")[
            "request"
        ] = {}
        self.assertEqual(summarize(run)["control_screen"], "unavailable")

    def test_action_unknown_restore_or_budget_reset_cannot_pass(self):
        for field, value in (
            ("ledger_state", "dirty"),
            ("actions", 0),
            ("reserved_ns", 0),
        ):
            run = acquisition("action")
            next(e for e in run["events"] if e["kind"] == "action_cost_result")[
                field
            ] = value
            self.assertEqual(summarize(run)["control_screen"], "unavailable")

    def test_windows_cannot_shift_or_hide_missing_edges_and_cost_scopes(self):
        for mutation in ("late", "missing", "costs", "old_protocol"):
            run = acquisition()
            s = next(e for e in run["events"] if e["kind"] == "action_cost_schedule")
            if mutation == "late":
                s["edges"][3]["script_age_ns"] += 200000000
            elif mutation == "missing":
                s["edges"].pop()
            elif mutation == "costs":
                s["unmeasured_cost_scopes"] = []
            else:
                run["method"] = "n10-contained-game-control-disturbance-v1"
            self.assertEqual(summarize(run)["control_screen"], "unavailable")

    def test_spliced_trace_stale_restore_and_worker_replacement_stay_unavailable(self):
        for mutation in ("trace", "stale", "worker", "counter"):
            run = acquisition("action")
            if mutation == "trace":
                run["continuity"][0]["frames"][0]["pts_ms"] += 1
            elif mutation == "stale":
                next(
                    e
                    for e in run["events"]
                    if e["kind"] == "action_cost_restore_observed"
                )["native_sequences"]["first"] = 29
            elif mutation == "worker":
                [e for e in run["events"] if e["kind"] == "control_native"][1][
                    "worker_identities"
                ]["first"] = "f" * 64
            else:
                run["control_windows"][2]["quality"][0]["stats"][3]["decoded"] = 0
            self.assertEqual(summarize(run)["control_screen"], "unavailable")

    def test_expected30fps_unchanged_during_cannot_use_action24fps_samples(self):
        run = acquisition()
        report = [e for e in run["events"] if e["kind"] == "control_native"][1]
        report["samples"][0]["workers"]["first"]["settings"]["configured_fps"] = 24
        self.assertEqual(summarize(run)["control_screen"], "unavailable")

    def test_old_summary_and_failed_acquisition_are_not_accepted(self):
        self.assertEqual(
            summarize(original_acquisition())["control_screen"], "unavailable"
        )
        self.assertEqual(
            summarize(dict(status="failed"))["control_screen"], "unavailable"
        )

    def test_counter_resets_clock_splices_and_false_like_authority_are_rejected(self):
        for mutation in (
            "cpu_reset",
            "event_origin",
            "sample_origin",
            "authority",
            "fractional_lifecycle",
        ):
            with self.subTest(mutation=mutation):
                run = acquisition("action")
                if mutation == "cpu_reset":
                    reports = [
                        e for e in run["events"] if e["kind"] == "control_native"
                    ]
                    reports[1]["samples"][0]["parent"]["cpu_ticks"] = 0
                elif mutation == "event_origin":
                    next(
                        e
                        for e in run["events"]
                        if e["kind"] == "action_cost_target_observed"
                    )["at_ns"] += 2000000
                elif mutation == "sample_origin":
                    next(e for e in run["events"] if e["kind"] == "control_native")[
                        "samples"
                    ][5]["game_phase"]["game_age_ns"] += 2000000
                elif mutation == "authority":
                    next(e for e in run["events"] if e["kind"] == "action_cost_result")[
                        "result"
                    ]["live_authority"] = 0
                else:
                    run["viewers"][0]["bindings"] = 1.0
                self.assertEqual(summarize(run)["control_screen"], "unavailable")
