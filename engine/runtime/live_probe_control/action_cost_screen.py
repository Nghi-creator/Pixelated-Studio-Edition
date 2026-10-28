"""Separate fixed-schedule acquisition screen, without an action-cost qualification budget."""

from .control_disturbance_screen import continuity_screen, screen_main
from .observer_screen import (
    acquisition_context,
    browser_screen,
    delta,
    number,
    resources,
)
from .probe_transport import hash_value, request_value
from .observer_moving_screen import script_phase

from .action_cost_protocol import METHOD, SCHEDULE, PHASES, UNMEASURED_COST_SCOPES


def one(events, kind):
    rows = [e for e in events if e["kind"] == kind]
    if len(rows) != 1:
        raise ValueError("one " + kind + " required")
    return rows[0]


def integer(value):
    number(value)
    if type(value) is not int:
        raise ValueError("integral acquisition counter required")
    return value


def protocol(run):
    condition = run["condition"]
    if condition not in ("unchanged", "action") or run[
        "mode"
    ] != "engineering-game-" + (
        "unchanged-cost" if condition == "unchanged" else "action-cost"
    ):
        raise ValueError("closed condition/mode required")
    if (
        run["status"] != "passed"
        or run["method"] != METHOD
        or run["role"] != "contained_game_action_cost_not_qualification"
        or run["live_authority"] is not False
    ):
        raise ValueError("matching complete acquisition required")
    acquisition_context(run)
    events = run["events"]
    ready, bound, complete = (
        one(events, kind)
        for kind in ("camera_ready", "control_capture_bound", "complete")
    )
    if (
        ready["mode"] != run["mode"]
        or ready["source"] != "isolated_game"
        or complete["worker_cleanup"] is not True
        or complete["game_alive"] is not True
        or complete["live_authority"] is not False
    ):
        raise ValueError("owned game/cleanup observations required")
    if (
        bound["method"] != METHOD
        or bound["scope"] != "owned_x99_game_display"
        or bound["live_authority"] is not False
    ):
        raise ValueError("exact capture scope required")
    hash_value(bound["binding_hash"])
    summary = one(events, "action_cost_schedule")
    boundary = one(events, "action_cost_boundary")
    if (
        any(
            e["method"] != METHOD
            or e["condition"] != condition
            or e["live_authority"] is not False
            for e in (summary, boundary)
        )
        or summary["schedule"] != SCHEDULE
        or any(type(v) is not int for v in summary["schedule"].values())
        or summary["source_content_matched"] is not False
    ):
        raise ValueError("fixed schedule/context required")
    if summary["unmeasured_cost_scopes"] != list(UNMEASURED_COST_SCOPES):
        raise ValueError("unmeasured costs must stay explicit")
    if any(
        e["kind"] in ("control_dispatched", "control_result", "game_failure_dispatched")
        for e in events
    ):
        raise ValueError("other action protocol cannot substitute for this acquisition")
    outcome = [e for e in events if e["kind"] == "action_cost_result"]
    if condition == "unchanged":
        if (
            boundary["request"] is not None
            or outcome
            or summary["journal_state"] != "absent"
            or integer(summary["actions"]) != 0
            or integer(summary["reserved_ns"]) != 0
        ):
            raise ValueError("unchanged condition created request/intent/result")
    else:
        request_value(boundary["request"])
        if (
            boundary["request"]["target_fps"] != 24
            or boundary["request"]["duration_ns"] != 5000000000
            or len(outcome) != 1
        ):
            raise ValueError("one bounded action required")
        result = outcome[0]
        if result["result"]["live_authority"] is not False:
            raise ValueError("controller result cannot grant authority")
        if (
            result["method"] != METHOD
            or result["live_authority"] is not False
            or result["result"]
            != dict(
                request_id=boundary["request"]["request_id"],
                outcome="completed",
                reason="duration_elapsed",
                restoration="verified_by_port",
                live_authority=False,
            )
        ):
            raise ValueError("verified controller result required")
        for row in (result, summary):
            if (
                row["ledger_state" if row is result else "journal_state"] != "clean"
                or integer(row["actions"]) != 1
                or integer(row["reserved_ns"]) != 7000000000
            ):
                raise ValueError("full retained reservation required")
    edges = summary["edges"]
    labels = (
        "baseline_start",
        "baseline_end",
        "boundary",
        "during_start",
        "during_end",
        "restored_start",
        "restored_end",
    )
    if len(edges) != len(labels) or tuple(e["label"] for e in edges) != labels:
        raise ValueError("complete fixed edges required")
    for e in edges:
        name = e["label"].split("_")[0]
        expected = SCHEDULE[name] + (2500000000 if e["label"].endswith("_end") else 0)
        tolerance = 500000000 if e["label"].endswith("_end") else 150000000
        if (
            integer(e["planned_script_age_ns"]) != expected
            or not 0 <= integer(e["script_age_ns"]) - expected <= tolerance
        ):
            raise ValueError("fixed edge missed")
        integer(e["at_ns"])
    if delta(edges, "at_ns") <= 0 or any(
        b["at_ns"] <= a["at_ns"] for a, b in zip(edges, edges[1:])
    ):
        raise ValueError("edge clock reversed")
    offsets = [integer(e["game_age_ns"]) - e["script_age_ns"] for e in edges]
    if max(offsets) - min(offsets) > 1000000 or any(
        abs(
            (e["at_ns"] - edges[0]["at_ns"])
            - (e["script_age_ns"] - edges[0]["script_age_ns"])
        )
        > 1000000
        for e in edges
    ):
        raise ValueError("script/camera origin changed")
    eligible = summary["eligibility"]
    if len(eligible) != 2 or [e["label"] for e in eligible] != [
        "eligible",
        "window_start",
    ]:
        raise ValueError("presentation/script eligibility required")
    script_phase(eligible[0], eligibility=True)
    if (
        integer(eligible[0]["at_ns"]) > 8000000000
        or not 3000000000 <= script_phase(eligible[1]) <= 3150000000
    ):
        raise ValueError("eligibility/warmup deadline")
    for kind, phase in (
        ("moving_eligible", eligible[0]),
        ("moving_window", eligible[1]),
    ):
        if one(events, kind) != {"kind": kind, "method": METHOD, **phase}:
            raise ValueError("eligibility events disagree")
    target = one(events, "action_cost_target_observed")
    if (
        target["method"] != METHOD
        or target["condition"] != condition
        or target["live_authority"] is not False
        or integer(target["target_fps"]) != (24 if condition == "action" else 30)
    ):
        raise ValueError("observed target scope mismatch")
    if (
        not edges[2]["at_ns"]
        <= integer(target["at_ns"])
        <= edges[3]["at_ns"] - 500000000
    ):
        raise ValueError("target settling not observed before fixed window")
    for name in ("first", "second"):
        seq = integer(target["native_sequences"][name])
        prior = integer(boundary["native_sequences"][name])
        if seq < prior or (condition == "action" and seq == prior):
            raise ValueError("target snapshot predates action")
    restores = [e for e in events if e["kind"] == "action_cost_restore_observed"]
    if condition == "unchanged":
        if restores:
            raise ValueError("unchanged condition fabricated restoration")
    else:
        restored = one(events, "action_cost_restore_observed")
        if (
            restored["method"] != METHOD
            or restored["live_authority"] is not False
            or not edges[2]["at_ns"] + 5000000000
            <= integer(outcome[0]["at_ns"])
            <= integer(restored["at_ns"])
            <= edges[5]["at_ns"] - 500000000
        ):
            raise ValueError("result/restore settling order")
        for name in ("first", "second"):
            if integer(restored["native_sequences"][name]) <= integer(
                restored["after_result_sequences"][name]
            ):
                raise ValueError("restored sample not newer than result")
    flow = [
        e["kind"]
        + (
            ":" + e["phase"]
            if e["kind"] in ("control_native", "control_window_started")
            else ""
        )
        for e in events
        if e["kind"]
        in (
            "control_native",
            "control_window_started",
            "action_cost_boundary",
            "action_cost_target_observed",
            "action_cost_result",
            "action_cost_restore_observed",
            "action_cost_schedule",
        )
    ]
    expected = [
        "control_window_started:baseline",
        "control_native:baseline",
        "action_cost_boundary",
        "action_cost_target_observed",
        "control_window_started:during",
        "control_native:during",
    ]
    if condition == "action":
        expected += ["action_cost_result", "action_cost_restore_observed"]
    expected += [
        "control_window_started:restored",
        "control_native:restored",
        "action_cost_schedule",
    ]
    if flow != expected or not events.index(bound) < events.index(
        boundary
    ) < events.index(summary) < events.index(complete):
        raise ValueError("fixed acquisition event flow mismatch")
    points = (
        edges
        + eligible
        + [target]
        + (outcome + restores if condition == "action" else [])
    )
    for point in points:
        if (
            abs(
                (integer(point["at_ns"]) - edges[0]["at_ns"])
                - (integer(point["script_age_ns"]) - edges[0]["script_age_ns"])
            )
            > 1000000
            or abs(integer(point["game_age_ns"]) - point["script_age_ns"] - offsets[0])
            > 1000000
        ):
            raise ValueError("observation camera/script origins disagree")
    if len(run["viewers"]) != 2 or any(
        integer(v["failures"]) != 0
        or integer(v["bindings"]) != 1
        or integer(v["unbound"]) != 1
        for v in run["viewers"]
    ):
        raise ValueError("unchanged peer lifetimes required")
    return condition, events


def summarize(run):
    result = {
        "method": METHOD,
        "control_screen": "unavailable",
        "live_authority": False,
        "qualification": "unavailable_action_cost_acquisition_only",
        "action_cost_budget": "not_evaluated",
        "unmeasured_cost_scopes": list(UNMEASURED_COST_SCOPES),
        "resource_scope": "descriptive_measured_phases_only",
        "perceptual_quality": "not_evaluated",
        "audio_quality": "not_evaluated",
        "source_content_matched": False,
        "causal_action_effect": "not_established",
    }
    try:
        condition, events = protocol(run)
        windows = run["control_windows"]
        native = [e for e in events if e["kind"] == "control_native"]
        if any(
            len(values) != 3 or tuple(e["phase"] for e in values) != PHASES
            for values in (windows, native)
        ):
            raise ValueError("three ordered windows required")
        identities = native[0]["worker_identities"]
        if (
            set(identities) != {"first", "second"}
            or identities["first"] == identities["second"]
        ):
            raise ValueError("distinct exact workers required")
        for value in identities.values():
            hash_value(value)
        rows, previous, all_samples = [], -1, []
        for phase, window, report in zip(PHASES, windows, native, strict=True):
            if (
                report["method"] != METHOD
                or report["worker_identities"] != identities
                or len(window["quality"]) != 2
            ):
                raise ValueError("measurement identity changed")
            samples = report["samples"]
            if samples[0]["read_start_ns"] <= previous:
                raise ValueError("native windows overlapped")
            previous = samples[-1]["read_end_ns"]
            for s in samples:
                for peer in ("first", "second"):
                    fps = (
                        24
                        if condition == "action"
                        and phase == "during"
                        and peer == "first"
                        else 30
                    )
                    settings = s["workers"][peer]["settings"]
                    if any(
                        type(v) is not int for v in settings.values()
                    ) or settings != dict(
                        configured_fps=fps,
                        negotiated_fps=fps,
                        width=640,
                        height=480,
                        target_bitrate=1500000,
                        cpu_used=6,
                        max_quantizer=48,
                    ):
                        raise ValueError("actual profile/cadence changed")
            for key in ("game_age_ns", "script_age_ns", "script_actions"):
                if delta([s["game_phase"] for s in samples], key) <= 0:
                    raise ValueError("game/script did not advance")
            edges = one(events, "action_cost_schedule")["edges"]
            start = next(e for e in edges if e["label"] == phase + "_start")
            end = next(e for e in edges if e["label"] == phase + "_end")
            if (
                not 0
                <= script_phase(samples[0]["game_phase"]) - start["script_age_ns"]
                <= 50000000
                or not 0
                <= end["script_age_ns"] - script_phase(samples[-1]["game_phase"])
                <= 50000000
            ):
                raise ValueError("native phase edge coverage mismatch")
            if any(
                b["read_start_ns"] <= a["read_end_ns"]
                for a, b in zip(samples, samples[1:])
            ):
                raise ValueError("native read brackets overlap")
            offset = start["game_age_ns"] - start["script_age_ns"]
            for sample in samples:
                point = sample["game_phase"]
                if (
                    abs(integer(point["game_age_ns"]) - point["script_age_ns"] - offset)
                    > 1000000
                    or abs(
                        (sample["read_start_ns"] - samples[0]["read_start_ns"])
                        - (
                            point["script_age_ns"]
                            - samples[0]["game_phase"]["script_age_ns"]
                        )
                    )
                    > 50000000
                ):
                    raise ValueError("native phase clock origin disagrees")
            rows.append(
                {
                    "phase": phase,
                    "viewers": [
                        browser_screen(
                            q,
                            measurement_ms=2000,
                            expected_fps=24
                            if condition == "action" and phase == "during" and i == 0
                            else 30,
                        )
                        for i, q in enumerate(window["quality"])
                    ],
                    "resources": resources(
                        {
                            "events": [{**report, "kind": "screen_native"}],
                            "browser_resources": window["browser_resources"],
                        },
                        duration_ns=2500000000,
                    ),
                }
            )
            all_samples.extend(samples)
        for peer in ("first", "second"):
            for key in ("cpu_ticks", "capture_buffers", "encoded_buffers"):
                delta([s["workers"][peer] for s in all_samples], key)
        for actor in ("parent", "relay", "game"):
            delta([s[actor] for s in all_samples], "cpu_ticks")
        if len(run["continuity"]) != 2:
            raise ValueError("two continuous traces required")
        traces = [continuity_screen(t) for t in run["continuity"]]
        for viewer in (0, 1):
            stats = [s for w in windows for s in w["quality"][viewer]["stats"]]
            if delta(stats, "dropped") != 0 or delta(stats, "freezes") != 0:
                raise ValueError("transition drops/freezes")
            delta(stats, "decoded")
            by_count = {
                f["presented"]: f["pts_ms"] for f in run["continuity"][viewer]["frames"]
            }
            frames = [f for w in windows for f in w["quality"][viewer]["frames"]]
            delta(frames, "presented")
            if any(by_count.get(f["presented"]) != f["pts_ms"] for f in frames):
                raise ValueError("phase/continuous trace mismatch")
        result.update(
            condition=condition,
            windows=rows,
            continuity=traces,
            control_screen="met"
            if all(t["met"] for t in traces)
            and all(q["met"] for row in rows for q in row["viewers"])
            else "not_met",
        )
    except (ValueError, KeyError, TypeError, IndexError, OverflowError) as exc:
        result["unavailable_reason"] = str(exc)
    return result


def main():
    return screen_main(summarize)


if __name__ == "__main__":
    raise SystemExit(main())
