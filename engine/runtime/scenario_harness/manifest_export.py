"""Closed producer declarations; detached core validation remains independent."""

import json
import re

from .contracts import PHASES, SECOND, integer

SCENARIOS = (
    "healthy",
    "host_contention",
    "render_capture_slowdown",
    "encoder_overload",
    "network_delay",
    "network_jitter",
    "network_loss",
    "bandwidth_pressure",
    "client_decode_pressure",
    "mixed",
    "changing",
)
REASONS = (
    "adapter_not_implemented",
    "runtime_unavailable",
    "permission_denied",
    "clock_unavailable",
    "source_unavailable",
)


def json_bytes(value):
    return (
        json.dumps(value, sort_keys=True, indent=2, ensure_ascii=False, allow_nan=False) + "\n"
    ).encode("utf-8")


def closed(value, keys):
    if type(value) is not dict or set(value) != set(keys.split()):
        raise ValueError("closed sanitized declaration required")


def manifest_bytes(value, plan=None):
    closed(
        value,
        "schema_version method_release experiment_id run_id node_id workload_id clock_id "
        "provenance scenario seed repeat_index assignment core_version producer_version runtime "
        "adapter phases actions trace_policy",
    )
    if (
        value["schema_version"] != "experiment-manifest-v1"
        or value["method_release"] != "n5-single-cause-v1"
    ):
        raise ValueError("frozen experiment declaration required")
    for key, prefix in (
        ("experiment_id", "experiment"),
        ("run_id", "run"),
        ("node_id", "node"),
        ("workload_id", "workload"),
        ("clock_id", "clock"),
    ):
        alias = value[key]
        if not isinstance(alias, str) or not re.fullmatch(prefix + r"-[1-9][0-9]{0,9}", alias):
            raise ValueError("sanitized alias required")
        integer(int(alias.split("-")[1]), 1, 2**31 - 1)
    for key in ("core_version", "producer_version"):
        if not isinstance(value[key], str) or not re.fullmatch(r"[0-9a-f]{40}", value[key]):
            raise ValueError("exact commit declaration required")
    integer(value["seed"], 0, 2**32 - 1)
    integer(value["repeat_index"], 1, 100)
    if (
        value["assignment"] not in ("engineering", "reference", "held_out_query")
        or value["scenario"] not in SCENARIOS
    ):
        raise ValueError("approved assignment/scenario required")
    runtime = value["runtime"]
    closed(
        runtime,
        "kind python_version node_version gst_version cpu_allocation width height fps "
        "codec clock_source clock_resolution_ns",
    )
    expected_kind = {"synthetic": "synthetic", "producer_capture": "linux_x11"}.get(
        value["provenance"]
    )
    if (
        expected_kind is None
        or runtime["kind"] != expected_kind
        or runtime["codec"] != "vp8"
        or runtime["clock_source"] != "python_monotonic_ns"
    ):
        raise ValueError("runtime/provenance mismatch")
    for key in ("python_version", "node_version", "gst_version"):
        if not isinstance(runtime[key], str) or not re.fullmatch(
            r"(?:0|[1-9][0-9]{0,2})(?:\.(?:0|[1-9][0-9]{0,2})){1,3}", runtime[key]
        ):
            raise ValueError("bounded numeric runtime version required")
    for key, expected in (("width", 1280), ("height", 720), ("fps", 30)):
        integer(runtime[key], expected, expected)
    integer(runtime["cpu_allocation"], 1, 64)
    integer(runtime["clock_resolution_ns"], 1)
    adapter = value["adapter"]
    closed(adapter, "adapter_id state reason")
    adapter_id = {"healthy": "none", "host_contention": "bounded_cpu_pressure"}.get(
        value["scenario"]
    )
    if (
        adapter["adapter_id"] != adapter_id
        or adapter["state"] not in ("available", "unavailable")
        or (
            adapter["state"] == "available"
            and (adapter_id is None or adapter["reason"] is not None)
        )
        or (adapter["state"] == "unavailable" and adapter["reason"] not in REASONS)
    ):
        raise ValueError("adapter availability mismatch")
    phases = value["phases"]
    if type(phases) is not list or len(phases) != 6:
        raise ValueError("six declared phases required")
    for phase, expected in zip(phases, PHASES, strict=True):
        closed(phase, "phase duration_ns")
        if phase["phase"] != expected:
            raise ValueError("phase order mismatch")
        integer(phase["duration_ns"], SECOND, 300 * SECOND)
    durations = tuple(p["duration_ns"] for p in phases)
    if sum(durations) > 1200 * SECOND:
        raise ValueError("run exceeds watchdog")
    policy = value["trace_policy"]
    closed(policy, "scope every_nth_frame max_frames max_events")
    if policy["scope"] != "per_phase":
        raise ValueError("per-phase trace policy required")
    integer(policy["every_nth_frame"], 1, 1000)
    integer(policy["max_frames"], 1, 2000)
    integer(policy["max_events"], 1, 10000)
    for duration in durations[1:5]:
        denominator = SECOND * policy["every_nth_frame"]
        frames = (duration * 30 + denominator - 1) // denominator
        if frames > policy["max_frames"] or 5 * frames > policy["max_events"]:
            raise ValueError("recording capacity exceeded")
    actions = value["actions"]
    if type(actions) is not list or len(actions) != (
        1 if value["scenario"] == "host_contention" else 0
    ):
        raise ValueError("requested action inventory mismatch")
    workers = 0
    if actions:
        action = actions[0]
        closed(action, "action_id kind start_phase stop_phase workers max_duration_ns")
        if (
            action["action_id"] != "action-1"
            or action["kind"] != "cpu_pressure"
            or action["start_phase"] != "degraded"
            or action["stop_phase"] != "recovery"
        ):
            raise ValueError("bounded action required")
        workers = integer(action["workers"], 1, min(8, runtime["cpu_allocation"]))
        integer(sum(durations[2:4]), 30 * SECOND, 290 * SECOND)
        integer(
            action["max_duration_ns"],
            sum(durations[2:4]) + 10 * SECOND,
            sum(durations[2:4]) + 10 * SECOND,
        )
    if plan is not None and (
        value["run_id"] != plan.run_id
        or value["seed"] != plan.seed
        or value["scenario"] != plan.scenario
        or durations != plan.durations_ns
        or workers != plan.workers
        or tuple(policy[k] for k in ("every_nth_frame", "max_frames", "max_events"))
        != (
            plan.trace_config.every_nth_frame,
            plan.trace_config.max_frames,
            plan.trace_config.max_events,
        )
    ):
        raise ValueError("manifest differs from executed plan")
    return json_bytes(value)
