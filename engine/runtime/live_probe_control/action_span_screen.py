"""Full-span descriptive CPU/RSS, including explicit incomplete failure prefixes."""

from .action_cost_screen import summarize as phase_screen
from .observer_screen import number, delta
from .control_disturbance_screen import screen_main

METHOD = "n10-owned-game-cost-span-v1"
EXCLUDED = [
    "lease_guard",
    "watchdog_child",
    "startup_and_warmup",
    "teardown",
    "browser_rss_and_gpu",
]
ACTORS = ("parent", "relay", "game", "pulse", "first", "second")


def summarize(run):
    result = {
        "method": METHOD,
        "control_screen": "unavailable",
        "cost_limits": "not_evaluated",
        "qualification": "unavailable_descriptive_span_only",
        "live_authority": False,
        "excluded_cost_scopes": EXCLUDED.copy(),
        "total_system_or_failure_cleanup_cost": "unavailable",
    }
    try:
        data = run if run["status"] == "passed" else run["acquisition"]
        if run["live_authority"] is not False or data["live_authority"] is not False:
            raise ValueError("span cannot grant authority")
        if data["mode"] not in (
            "engineering-game-unchanged-span",
            "engineering-game-action-span",
            "engineering-game-action-span-failure",
        ):
            raise ValueError("closed span acquisition required")
        events = data["events"]
        starts = [e for e in events if e["kind"] == "cost_span_started"]
        samples = [e for e in events if e["kind"] == "cost_span_sample"]
        ends = [e for e in events if e["kind"] == "cost_span_finished"]
        if len(starts) != 1 or len(ends) != 1 or not 2 <= len(samples) <= 96:
            raise ValueError("complete span boundaries/counter prefix unavailable")
        start, end = starts[0], ends[0]
        if any(
            e["method"] != METHOD or e["live_authority"] is not False
            for e in [start, *samples, end]
        ) or any(e["excluded_cost_scopes"] != EXCLUDED for e in (start, end)):
            raise ValueError("span method/authority/scope mismatch")
        if (
            type(end["sample_count"]) is not int
            or end["sample_count"] != len(samples)
            or [e["sequence"] for e in samples] != list(range(len(samples)))
            or any(type(e["sequence"]) is not int for e in samples)
        ):
            raise ValueError("span sample gap/count mismatch")
        if (
            not events.index(start)
            < events.index(samples[0])
            < events.index(samples[-1])
            < events.index(end)
        ):
            raise ValueError("span boundary order mismatch")
        stamps = [number(s["read_start_ns"]) for s in samples]
        if any(not 0 < b - a <= 500000000 for a, b in zip(stamps, stamps[1:])) or any(
            not 0 <= number(s["read_end_ns"]) - s["read_start_ns"] <= 50000000
            for s in samples
        ):
            raise ValueError("span native coverage/read bracket unavailable")
        if any(
            b["read_start_ns"] < a["read_end_ns"] for a, b in zip(samples, samples[1:])
        ):
            raise ValueError("span native reads overlapped")
        duration = stamps[-1] - stamps[0]
        ages = [number(sample["game_phase"]["script_age_ns"]) for sample in samples]
        if (
            not 0 < duration <= 26000000000
            or not 3000000000 <= ages[0] <= 3150000000
            or any(
                abs((stamp - stamps[0]) - (age - ages[0])) > 50000000
                for stamp, age in zip(stamps, ages, strict=True)
            )
        ):
            raise ValueError("native span/script clock coverage mismatch")
        ticks = number(end["ticks_per_second"])
        if (
            type(end["ticks_per_second"]) is not int
            or ticks <= 0
            or any(s["missing"] or set(s["actors"]) != set(ACTORS) for s in samples)
        ):
            raise ValueError("owned process costs missing; never zero-fill")
        costs = {}
        for actor in ACTORS:
            values = [s["actors"][actor] for s in samples]
            cpu = delta(values, "cpu_ticks") / ticks
            costs[actor] = {
                "cpu_seconds": cpu,
                "cpu_percent": cpu * 100000000000 / duration,
                "sampled_peak_rss_bytes": max(number(v["rss_bytes"]) for v in values),
            }
        browser = data["browser_cost_span"]
        a, b = browser["before"], browser["after"]
        if (
            browser["method"] != "n10-browser-cost-span-v1"
            or browser["basis"]
            != "host_hrtime_browser_owned_process_cpu_separate_clock"
            or browser["failure"] is not None
        ):
            raise ValueError("browser span observation unavailable")
        if not a["inventory_hash"] or (a["inventory_hash"], a["process_count"]) != (
            b["inventory_hash"],
            b["process_count"],
        ):
            raise ValueError("browser process inventory changed")
        wall = number(b["host_at_ns"]) - number(a["host_at_ns"])
        if wall <= 0:
            raise ValueError("browser span clock reversed")
        cpu = delta([a, b], "cpu_seconds", integral=False)
        complete = run["status"] == "passed"
        expected = "completed" if complete else "failed_prefix"
        if end["outcome"] != expected or browser["outcome"] != expected:
            raise ValueError("span outcome disagrees with acquisition")
        if complete:
            phase = phase_screen(run)
            if (
                phase["control_screen"] != "met"
                or not 13500000000 <= duration <= 14500000000
                or not 12500000000 <= wall <= 16000000000
            ):
                raise ValueError("complete span/phase coverage unavailable")
            schedule = next(e for e in events if e["kind"] == "action_cost_schedule")
            edges = schedule["edges"]
            if (
                abs(
                    samples[0]["game_phase"]["script_age_ns"]
                    - edges[0]["script_age_ns"]
                )
                > 50000000
                or abs(
                    samples[-1]["game_phase"]["script_age_ns"]
                    - edges[-1]["script_age_ns"]
                )
                > 50000000
            ):
                raise ValueError("span does not cover fixed phase edges")
        result.update(
            control_screen="met" if complete else "partial_failure_prefix",
            outcome=expected,
            native_duration_ns=duration,
            native_costs=costs,
            browser_duration_ns=wall,
            browser_cpu_seconds=cpu,
            browser_cpu_percent=cpu * 100000000000 / wall,
            clock_alignment="none_separate_native_and_browser_spans",
        )
    except (
        ValueError,
        KeyError,
        TypeError,
        IndexError,
        OverflowError,
        StopIteration,
    ) as exc:
        result["unavailable_reason"] = str(exc)
    return result


def main():
    return screen_main(summarize)


if __name__ == "__main__":
    raise SystemExit(main())
