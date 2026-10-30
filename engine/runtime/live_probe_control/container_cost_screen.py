"""Descriptive private-container CPU through callbacks; never a total exit-cost claim."""

from .observer_screen import number

METHOD = "n10-private-container-cleanup-cpu-v1"


def summarize(data, *, action=False):
    result = dict(
        method=METHOD,
        screen="unavailable",
        live_authority=False,
        scope="camera_ready_through_cleanup_callbacks",
        excluded_tail="relay_interpreter_container_and_browser_exit",
    )
    if action:
        result.update(
            method="n10-private-container-action-cpu-v1",
            scope="baseline_through_restored_end_or_failure_prefix",
            excluded_tail="startup_warmup_and_cleanup",
        )
    prefix = "container_action_cost_" if action else "container_cost_"
    try:
        events = data["events"]
        starts = [e for e in events if e["kind"] == prefix + "started"]
        ends = [e for e in events if e["kind"] == prefix + "finished"]
        if len(starts) != 1 or len(ends) != 1:
            raise ValueError("container CPU boundaries unavailable")
        a, b = starts[0], ends[0]
        if (
            any(
                e["method"] != result["method"] or e["live_authority"] is not False
                for e in (a, b)
            )
            or b["failure"] is not None
            or b["scope"] != result["scope"]
            or b["excluded_tail"] != result["excluded_tail"]
        ):
            raise ValueError("container CPU scope/observations unavailable")
        if not action:
            if not (
                b["scene_closed"] is True
                and b["pulse_reaped"] is True
                and b["workers_closed"] is True
                and type(b["active_peers"]) is int
                and b["active_peers"] == 0
            ):
                raise ValueError("cleanup callback completion unconfirmed")
            closed = [
                e
                for e in events
                if e["kind"] == "host_shutdown" and e.get("stage") == "scene_closed"
            ]
            if len(closed) != 1 or not events.index(a) < events.index(
                closed[0]
            ) < events.index(b):
                raise ValueError("cleanup cost boundary chronology unavailable")
        else:
            if b["outcome"] != (
                "completed" if data["status"] == "passed" else "failed_prefix"
            ) or events.index(a) >= events.index(b):
                raise ValueError("container action outcome/chronology unavailable")
            native = [e for e in events if e["kind"] == "cost_span_sample"]
            if (
                len(native) < 2
                or abs(a["sample"]["read_start_ns"] - native[0]["read_start_ns"])
                > 50000000
                or abs(b["sample"]["read_start_ns"] - native[-1]["read_start_ns"])
                > 50000000
            ):
                raise ValueError("container action/native span edges disagree")
        left, right = a["sample"], b["sample"]
        result.update(screen="met", **interval_cost(left, right))
    except (ValueError, KeyError, TypeError, IndexError, OverflowError) as exc:
        result["unavailable_reason"] = str(exc)
    return result


def interval_cost(left, right):
    for sample in (left, right):
        if (
            not 0
            <= number(sample["read_end_ns"]) - number(sample["read_start_ns"])
            <= 50000000
        ):
            raise ValueError("container read bracket unavailable")
    wall = right["read_start_ns"] - left["read_start_ns"]
    if not 0 < wall <= 40000000000:
        raise ValueError("container cost duration unavailable")
    costs = {}
    for key in ("usage_usec", "user_usec", "system_usec"):
        if (
            any(type(v[key]) is not int or number(v[key]) < 0 for v in (left, right))
            or right[key] < left[key]
        ):
            raise ValueError("container CPU counter reset")
        costs[key.removesuffix("_usec") + "_seconds"] = (
            right[key] - left[key]
        ) / 1000000
    return dict(
        duration_ns=wall,
        cpu_percent=costs["usage_seconds"] * 100000000000 / wall,
        **costs,
    )
