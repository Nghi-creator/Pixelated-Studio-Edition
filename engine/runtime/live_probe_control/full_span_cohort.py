"""Independent matched full-span deltas, with separately clocked container cleanup CPU."""

from .action_cost_cohort import assess as phase_assess, PAIRS, TOLERANCE_NS
from .action_span_screen import summarize as span_screen, ACTORS
from .container_cost_screen import summarize as container_screen
from .observer_screen import cohort_main

METHOD = "n10-owned-game-full-span-comparison-v1"


def assess(runs, *, action_container=False):
    result = phase_assess(runs, version="v3")
    result.update(
        method="n10-owned-game-full-span-comparison-v2" if action_container else METHOD,
        resource_scope="independent_native_browser_and_container_spans",
        qualification="unavailable_descriptive_full_span_comparison_only",
        total_system_or_failure_cleanup_cost="unavailable",
        full_span_pairs=[],
    )
    result["phase_only_unmeasured_cost_scopes"] = result.pop(
        "unmeasured_cost_scopes", []
    )
    result["excluded_cost_scopes"] = [
        "initial_source_startup",
        "relay_interpreter_container_and_browser_exit",
        "per_process_guard_watchdog_breakdown",
        "browser_rss_and_gpu",
    ]
    if not result["runs"]:
        return result
    summaries = []
    for row, run in zip(result["runs"], runs, strict=True):
        span = span_screen(run)
        container = container_screen(run, action=action_container)
        summaries.append((span, container))
        row["full_span"] = span
        row["container_action_cpu" if action_container else "container_cleanup_cpu"] = (
            container
        )
        if action_container:
            row["container_cleanup_cpu"] = container_screen(run)
    missing = []
    for off, on in PAIRS:
        pair = dict(unchanged=off, action=on, comparable=False, deltas=None)
        result["full_span_pairs"].append(pair)
        try:
            a, ca = summaries[off]
            b, cb = summaries[on]
            if (
                not result["pairs"][len(result["full_span_pairs"]) - 1]["comparable"]
                or any(s["control_screen"] != "met" for s in (a, b))
                or any(s["screen"] != "met" for s in (ca, cb))
            ):
                raise ValueError("paired full spans or cleanup costs unavailable")
            if (
                any(
                    abs(a[k] - b[k]) > TOLERANCE_NS
                    for k in ("native_duration_ns", "browser_duration_ns")
                )
                or abs(ca["duration_ns"] - cb["duration_ns"]) > TOLERANCE_NS
            ):
                raise ValueError(
                    "paired native/browser/container duration differs by more than150ms"
                )
            pair.update(
                comparable=True,
                deltas={
                    "native": {
                        actor: {
                            key: b["native_costs"][actor][key]
                            - a["native_costs"][actor][key]
                            for key in (
                                "cpu_seconds",
                                "cpu_percent",
                                "sampled_peak_rss_bytes",
                            )
                        }
                        for actor in ACTORS
                    },
                    "browser": {
                        key: b[key] - a[key]
                        for key in ("browser_cpu_seconds", "browser_cpu_percent")
                    },
                    "container": {
                        key: cb[key] - ca[key]
                        for key in (
                            "usage_seconds",
                            "user_seconds",
                            "system_seconds",
                            "cpu_percent",
                        )
                    },
                },
            )
        except (ValueError, KeyError, TypeError, IndexError) as exc:
            pair["reason"] = str(exc)
            missing.append(str(off) + "/" + str(on) + ": " + str(exc))
    if missing:
        result["comparison_screen"] = "unavailable"
        result["full_span_unavailable_reason"] = "; ".join(missing)
    return result


def main():
    return cohort_main(assess, screen_key="comparison_screen")


if __name__ == "__main__":
    raise SystemExit(main())
