"""Matched measured-phase comparison; total action cost and qualification stay unavailable."""

from .action_cost_protocol import PHASES, UNMEASURED_COST_SCOPES
from .action_cost_screen import integer, one, summarize
from .observer_moving_screen import script_phase
from .observer_screen import acquisition_context, cohort_main, number

METHOD = "n10-contained-game-action-cost-comparison-v1"
METHOD_V3 = "n10-contained-game-action-cost-comparison-v3"
METHOD_V2 = "n10-contained-game-action-cost-comparison-v2"
ORDER = tuple(
    "engineering-game-" + condition + "-cost"
    for condition in (
        "unchanged",
        "action",
        "action",
        "unchanged",
        "unchanged",
        "action",
    )
)
ORDER_V3 = tuple(
    "engineering-game-" + ("unchanged" if "unchanged" in mode else "action") + "-span"
    for mode in ORDER
)
ORDER_V2 = tuple(mode + "-v2" for mode in ORDER)
PAIRS = (
    (0, 1),
    (3, 2),
    (4, 5),
)  # unchanged, action; original acquisition order is retained
TOLERANCE_NS = 150000000
RESOURCE_KEYS = (
    "parent_cpu",
    "relay_cpu",
    "workers_cpu",
    "browser_cpu",
    "parent_peak_rss",
    "relay_peak_rss",
    "workers_peak_rss",
)


def phase_context(run):
    summary = one(run["events"], "action_cost_schedule")
    edges = summary["edges"]
    for point in edges + summary["eligibility"]:
        script_phase(point, eligibility=point["label"] == "eligible")
    windows = []
    for phase, browser in zip(PHASES, run["control_windows"], strict=True):
        native = next(
            e
            for e in run["events"]
            if e["kind"] == "control_native" and e["phase"] == phase
        )
        samples = native["samples"]
        for sample in samples:
            script_phase(sample["game_phase"])
        starts = []
        for viewer in (0, 1):
            trace = run["continuity"][viewer]["frames"]
            by_count = {f["presented"]: f for f in trace}
            first = browser["quality"][viewer]["frames"][0]
            # Relative browser progress only; never align browser and native clocks.
            starts.append(
                number(by_count[first["presented"]]["at_ms"])
                - number(trace[0]["at_ms"])
            )
        windows.append(
            {
                "phase": phase,
                "start": next(e for e in edges if e["label"] == phase + "_start"),
                "end": next(e for e in edges if e["label"] == phase + "_end"),
                "native_duration_ns": samples[-1]["read_start_ns"]
                - samples[0]["read_start_ns"],
                "browser_duration_ns": browser["browser_resources"]["after"][
                    "host_at_ns"
                ]
                - browser["browser_resources"]["before"]["host_at_ns"],
                "browser_phase_start_ms": starts,
                "ticks_per_second": number(native["ticks_per_second"]),
            }
        )
    return windows


def comparable(a, b):
    for left, right in zip(a, b, strict=True):
        if (
            left["phase"] != right["phase"]
            or left["ticks_per_second"] != right["ticks_per_second"]
        ):
            raise ValueError("phase or native tick rate differs")
        for edge in ("start", "end"):
            for clock in ("game_age_ns", "script_age_ns"):
                if (
                    abs(integer(left[edge][clock]) - integer(right[edge][clock]))
                    > TOLERANCE_NS
                ):
                    raise ValueError(
                        "paired game/script phase differs by more than 150 ms"
                    )
        for key in ("native_duration_ns", "browser_duration_ns"):
            if abs(number(left[key]) - number(right[key])) > TOLERANCE_NS:
                raise ValueError(
                    "paired measurement duration differs by more than 150 ms"
                )
        if any(
            abs(x - y) > 150
            for x, y in zip(
                left["browser_phase_start_ms"],
                right["browser_phase_start_ms"],
                strict=True,
            )
        ):
            raise ValueError(
                "paired browser phase progression differs by more than 150 ms"
            )


def assess(runs, *, version="v1"):
    if version not in ("v1", "v2", "v3"):
        raise ValueError("closed action-cost comparison version required")
    method, order = {
        "v1": (METHOD, ORDER),
        "v2": (METHOD_V2, ORDER_V2),
        "v3": (METHOD_V3, ORDER_V3),
    }[version]
    result = {
        "method": method,
        "comparison_screen": "unavailable",
        "runs": [],
        "pairs": [],
        "resource_scope": "descriptive_measured_phases_only",
        "cost_limits": "unavailable_not_predeclared_or_qualified",
        "total_transition_and_failure_cost": "unavailable",
        "unmeasured_cost_scopes": list(UNMEASURED_COST_SCOPES),
        "qualification": "unavailable_engineering_comparison_only",
        "live_authority": False,
        "source_content_matched": False,
        "causal_action_effect": "not_established",
        "perceptual_quality": "not_evaluated",
        "audio_quality": "not_evaluated",
    }
    try:
        if (
            type(runs) is not list
            or len(runs) != 6
            or tuple(r["mode"] for r in runs) != order
        ):
            raise ValueError("six original sessions in the predeclared order required")
        identity, seen_workers, seen_bindings, previous_end = None, set(), set(), None
        missing, temporal_failure = [], False
        for index, run in enumerate(runs):
            screen = summarize(run)
            if run.get("status") != "passed":
                failures = [
                    e.get("reason")
                    for e in run.get("acquisition", {}).get("events", [])
                    if e.get("kind") == "failed"
                ]
                reason = (
                    failures[-1]
                    if failures
                    else run.get("failure", "missing failure detail")
                )
                screen["unavailable_reason"] = (
                    "incomplete acquisition: " + str(reason).split("\n", 1)[0]
                )
            row = {
                "index": index,
                "mode": run["mode"],
                "acquisition_screen": screen["control_screen"],
                "state": "unavailable",
            }
            result["runs"].append(row)
            try:
                if screen["control_screen"] == "unavailable":
                    raise ValueError(
                        screen.get("unavailable_reason", "incomplete acquisition")
                    )
                key = acquisition_context(run)
                if identity is None:
                    identity = key
                if key != identity:
                    raise ValueError("cohort source/image/browser/host context changed")
                reports = [e for e in run["events"] if e["kind"] == "control_native"]
                workers = set(reports[0]["worker_identities"].values())
                binding = one(run["events"], "control_capture_bound")["binding_hash"]
                start, end = (
                    reports[0]["samples"][0]["read_start_ns"],
                    reports[-1]["samples"][-1]["read_end_ns"],
                )
                if workers & seen_workers or binding in seen_bindings:
                    raise ValueError(
                        "reused worker/capture session cannot be an independent repetition"
                    )
                if previous_end is not None and start <= previous_end:
                    raise ValueError(
                        "session native clocks overlap or acquisition order changed"
                    )
                # Retain observed identities even if later phase comparability is unavailable.
                seen_workers.update(workers)
                seen_bindings.add(binding)
                previous_end = end
                phases = phase_context(run)
                row.update(
                    state="measured",
                    condition=run["condition"],
                    windows=screen["windows"],
                    phases=phases,
                )
                temporal_failure |= screen["control_screen"] != "met"
            except (
                ValueError,
                KeyError,
                TypeError,
                IndexError,
                OverflowError,
                StopIteration,
            ) as exc:
                row["reason"] = str(exc)
                missing.append(str(index) + ": " + str(exc))
        for unchanged, action in PAIRS:
            pair = {
                "unchanged": unchanged,
                "action": action,
                "phase_deltas": None,
                "comparable": False,
            }
            result["pairs"].append(pair)
            left, right = result["runs"][unchanged], result["runs"][action]
            try:
                if left["state"] != "measured" or right["state"] != "measured":
                    raise ValueError("paired acquisition unavailable")
                comparable(left["phases"], right["phases"])
                pair.update(
                    comparable=True,
                    phase_deltas=[
                        {
                            "phase": phase,
                            "action_minus_unchanged": {
                                key: b["resources"][key] - a["resources"][key]
                                for key in RESOURCE_KEYS
                            },
                        }
                        for phase, a, b in zip(
                            PHASES, left["windows"], right["windows"], strict=True
                        )
                    ],
                )
            except (ValueError, KeyError, TypeError, IndexError, OverflowError) as exc:
                pair["reason"] = str(exc)
                missing.append(
                    "pair " + str(unchanged) + "/" + str(action) + ": " + str(exc)
                )
        if missing:
            result["unavailable_reason"] = "; ".join(missing)
        else:
            result["comparison_screen"] = "not_met" if temporal_failure else "met"
    except (ValueError, KeyError, TypeError, IndexError, OverflowError) as exc:
        result["unavailable_reason"] = str(exc)
    return result


def main():
    return cohort_main(assess, screen_key="comparison_screen")


if __name__ == "__main__":
    raise SystemExit(main())
