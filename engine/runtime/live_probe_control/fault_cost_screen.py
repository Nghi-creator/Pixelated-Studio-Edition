"""Actual fault lifecycle assertions and bounded container CPU; never qualified live limits."""

from .game_failure_screen import failure_summary, one, METHOD as LIFECYCLE_METHOD, CASES
from .observer_screen import acquisition_context, number, delta, cohort_main
from .container_cost_screen import summarize as cleanup_screen, interval_cost

METHOD = "n10-contained-game-fault-cost-v1"
ORDER = tuple("engineering-game-" + case + "-cost" for case in CASES)
PHASES = ("before_dispatch", "fault_injected", "result_observed", "lifecycle_verified")


def summarize(run):
    result = dict(
        method=METHOD,
        cost_screen="unavailable",
        live_authority=False,
        cost_limits="not_evaluated",
        qualification="unavailable_fault_cost_engineering_only",
        lifetime_comparison="not_evaluated_by_cost_screen",
        excluded_cost_scopes=[
            "initial_source_startup",
            "relay_interpreter_container_and_browser_exit",
            "per_process_ancillary_breakdown",
            "browser_cleanup_exit_rss_gpu",
        ],
    )
    try:
        if (
            run["status"] != "passed"
            or run["method"] != METHOD
            or run["role"] != "contained_game_fault_cost_not_qualification"
            or run["live_authority"] is not False
        ):
            raise ValueError("complete fault-cost acquisition required")
        acquisition_context(run)
        case = run["case"]
        if case not in CASES or run["mode"] != "engineering-game-" + case + "-cost":
            raise ValueError("closed fault-cost case required")
        # Reuse the existing lifecycle rules on a local view; do not relabel or mutate the record.
        lifecycle = failure_summary(
            {
                **run,
                "method": LIFECYCLE_METHOD,
                "role": "contained_game_failure_not_qualification",
            },
            case,
        )
        events = run["events"]
        gate = one(events, "fault_cost_started")
        points = [e for e in events if e["kind"] == "fault_cost_checkpoint"]
        if (
            len(points) != 4
            or tuple(e["phase"] for e in points) != PHASES
            or any(
                type(e["index"]) is not int or e["index"] != i
                for i, e in enumerate(points)
            )
        ):
            raise ValueError("ordered original cost checkpoints required")
        if any(
            e["method"] != METHOD
            or e["case"] != case
            or e["live_authority"] is not False
            for e in [gate, *points]
        ):
            raise ValueError("fault cost scope mismatch")
        if (
            not events.index(gate)
            < events.index(points[0])
            < events.index(one(events, "game_failure_dispatched"))
            < events.index(one(events, "game_failure_fault"))
            < events.index(points[1])
            < events.index(one(events, "game_failure_result"))
            < events.index(points[2])
            < events.index(one(events, "game_failure_verified"))
            < events.index(points[3])
        ):
            raise ValueError("fault/cost event chronology differs")
        lifetimes = [e for e in events if e["kind"] == "failure_lifetime"]
        if tuple(e["phase"] for e in lifetimes) != (
            "active_target",
            "replacement_ready",
            "issuer_restarted",
        ) or any(
            e["case"] != case or e["live_authority"] is not False for e in lifetimes
        ):
            raise ValueError("lifetime checkpoints absent")
        cleanup = cleanup_screen(run)
        if cleanup["screen"] != "met":
            raise ValueError(
                cleanup.get("unavailable_reason", "cleanup cost unavailable")
            )
        end = one(events, "container_cost_finished")
        if events.index(points[3]) >= events.index(end):
            raise ValueError("cleanup precedes recovery")
        stages = [
            dict(
                start=a["phase"],
                end=b["phase"],
                **interval_cost(a["sample"], b["sample"]),
            )
            for a, b in zip(points, points[1:])
        ]
        stages.append(
            dict(
                start="lifecycle_verified",
                end="cleanup_callbacks_finished",
                **interval_cost(points[-1]["sample"], end["sample"]),
            )
        )
        browser = run["browser_cost_span"]
        a, b = browser["before"], browser["after"]
        if (
            browser["method"] != "n10-browser-cost-span-v1"
            or browser["basis"]
            != "host_hrtime_browser_owned_process_cpu_separate_clock"
            or browser["outcome"] != "completed"
            or browser["failure"] is not None
        ):
            raise ValueError("browser fault span incomplete")
        if not a["inventory_hash"] or (a["inventory_hash"], a["process_count"]) != (
            b["inventory_hash"],
            b["process_count"],
        ):
            raise ValueError("browser process inventory changed")
        wall = number(b["host_at_ns"]) - number(a["host_at_ns"])
        if not 0 < wall <= 30000000000:
            raise ValueError("browser fault span clock unavailable")
        cpu = delta([a, b], "cpu_seconds", integral=False)
        result.update(
            cost_screen="met" if lifecycle["sibling"]["met"] else "not_met",
            case=case,
            lifecycle=lifecycle,
            container_intervals=stages,
            container_before_dispatch_through_cleanup=interval_cost(
                points[0]["sample"], end["sample"]
            ),
            browser_cpu_seconds=cpu,
            browser_cpu_percent=cpu * 100000000000 / wall,
            browser_duration_ns=wall,
            clock_alignment="none_browser_and_native_separate",
        )
    except (ValueError, KeyError, TypeError, IndexError, OverflowError) as exc:
        result["unavailable_reason"] = str(exc)
    return result


def assess(runs):
    result = dict(
        method=METHOD,
        cost_screen="unavailable",
        cases=[],
        live_authority=False,
        qualification="unavailable_fault_cost_engineering_only",
        cost_limits="not_evaluated",
    )
    try:
        if (
            type(runs) is not list
            or len(runs) != 4
            or tuple(r["mode"] for r in runs) != ORDER
        ):
            raise ValueError(
                "four original fault-cost cases in declared order required"
            )
        identity = None
        for run in runs:
            row = summarize(run)
            if row["cost_screen"] != "unavailable":
                key = acquisition_context(run)
                if identity is not None and key != identity:
                    row.update(
                        cost_screen="unavailable",
                        unavailable_reason="cohort context changed",
                    )
                else:
                    identity = key
            result["cases"].append(row)
        if all(r["cost_screen"] == "met" for r in result["cases"]):
            result["cost_screen"] = "met"
        elif all(r["cost_screen"] != "unavailable" for r in result["cases"]):
            result["cost_screen"] = "not_met"
    except (ValueError, KeyError, TypeError, IndexError) as exc:
        result["unavailable_reason"] = str(exc)
    return result


def main():
    return cohort_main(assess, screen_key="cost_screen")


if __name__ == "__main__":
    raise SystemExit(main())
