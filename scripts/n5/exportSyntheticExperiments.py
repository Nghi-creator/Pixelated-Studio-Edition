"""Fixed synthetic inputs through actual collectors/export; no runtime or pressure."""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "engine/runtime"))

from camera_trace import HostTraceRecording
from camera_trace_config import ENGINE_EVENTS, TraceConfig
from scenario_harness import (
    experiment_bundle_bytes,
    unsupported_bundle_bytes,
    write_experiment_bundle,
)
from scenario_harness.contracts import PHASES, SECOND, Execution, PhaseExecution, RunPlan

CASES = (
    "healthy",
    "host",
    "boundary",
    "failed-pressure",
    "cancelled",
    "unsupported",
    "missing-trace",
    "unknown-cleanup",
)


def inputs(case):
    workers = 0 if case == "healthy" else 1
    plan = RunPlan(
        "run-1",
        "host_contention" if workers else "healthy",
        7,
        tuple(s * SECOND for s in (10, 30, 30, 30, 30, 10)),
        workers,
        TraceConfig(every_nth_frame=1000, max_frames=2, max_events=10),
    )
    manifest = dict(
        schema_version="experiment-manifest-v1",
        method_release="n5-single-cause-v1",
        experiment_id="experiment-1",
        run_id="run-1",
        node_id="node-1",
        workload_id="workload-1",
        clock_id="clock-1",
        provenance="synthetic",
        scenario=plan.scenario,
        seed=7,
        repeat_index=1,
        assignment="engineering",
        core_version="a" * 40,
        producer_version="b" * 40,
        runtime=dict(
            kind="synthetic",
            python_version="3.14.4",
            node_version="26.4.0",
            gst_version="1.28.2",
            cpu_allocation=2,
            width=1280,
            height=720,
            fps=30,
            codec="vp8",
            clock_source="python_monotonic_ns",
            clock_resolution_ns=1,
        ),
        adapter=dict(
            adapter_id="bounded_cpu_pressure" if workers else "none", state="available", reason=None
        ),
        phases=[
            dict(phase=p, duration_ns=d) for p, d in zip(PHASES, plan.durations_ns, strict=True)
        ],
        actions=[
            dict(
                action_id="action-1",
                kind="cpu_pressure",
                start_phase="degraded",
                stop_phase="recovery",
                workers=1,
                max_duration_ns=70 * SECOND,
            )
        ]
        if workers
        else [],
        trace_policy=dict(scope="per_phase", every_nth_frame=1000, max_frames=2, max_events=10),
    )
    if case == "unsupported":
        manifest["adapter"].update(state="unavailable", reason="runtime_unavailable")
        return manifest, plan, None
    phases, frames = [], 0
    for index, phase in enumerate(PHASES):
        start = (0, 10, 40, 70, 101, 131)[index]
        seconds = (10, 30, 30, 30, 30, 10)[index]
        if case in ("cancelled", "unknown-cleanup") and index > 2:
            break
        partial = case in ("cancelled", "unknown-cleanup") and index == 2
        if partial:
            seconds = 25
        # The boundary uses alternating integer 28/29 counts: exactly 855/30.
        rate_total = (
            855
            if case == "boundary" and phase in ("degraded", "recovery")
            else seconds * (24 if workers and phase in ("degraded", "probe") else 30)
        )
        active = workers if phase in ("degraded", "probe") else 0
        cpu = (
            (
                500_000_000
                if case == "boundary"
                else 400_000_000
                if case == "failed-pressure"
                else 600_000_000
            )
            if active
            else 0
        )
        rows = tuple(
            (
                (start + i) * SECOND,
                (start + i + 1) * SECOND,
                frames + rate_total * i // seconds,
                frames + rate_total * (i + 1) // seconds,
                active,
                cpu,
            )
            for i in range(seconds)
        )
        phases.append(
            PhaseExecution(
                phase,
                start * SECOND,
                (start + seconds) * SECOND,
                "partial" if partial else "complete",
                "cancelled" if partial else None,
                rows,
            )
        )
        frames += rate_total
        if index == 3:
            frames += 30  # One observed cleanup second before recovery; not an interval.
    aborted = case in ("cancelled", "unknown-cleanup")
    stop = 65 * SECOND if aborted else 100 * SECOND
    unknown = case == "unknown-cleanup"
    execution = Execution(
        "aborted" if aborted else "completed",
        "cancelled" if aborted else None,
        tuple(phases),
        40 * SECOND if workers else None,
        None if unknown or not workers else stop,
        None if unknown or not workers else stop,
        None if unknown or not workers else stop + SECOND,
        "restored",
        None,
        9_000_000_000_000_000,
        9_000_000_000_000_001,
        (),
    )
    return manifest, plan, execution


def recordings(plan, execution):
    result = []
    for phase in execution.phases:
        if phase.phase not in PHASES[1:5]:
            continue
        ticks = [0]
        recording = HostTraceRecording(
            plan.trace_config, lambda ticks=ticks: ticks[0], resolution_ns=1
        )
        stream = recording.begin()
        frames = sum(row[3] - row[2] for row in phase.intervals)
        for frame in range(frames):
            ticks[0] = frame * 33_333_333
            recording.capture(stream, frame)
            for boundary in ENGINE_EVENTS[1:]:
                ticks[0] += 1_000_000
                recording.endpoint(stream, boundary, frame)
        recording.finish()
        result.append((phase.phase, recording))
    return tuple(result)


def export(destination):
    for case in CASES:
        manifest, plan, execution = inputs(case)
        payload = (
            unsupported_bundle_bytes(manifest)
            if execution is None
            else experiment_bundle_bytes(
                manifest,
                plan,
                execution,
                recordings=() if case == "missing-trace" else recordings(plan, execution),
            )
        )
        write_experiment_bundle(destination / f"{case}.tar.gz", payload)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("destination", type=Path, help="existing disposable directory")
    args = parser.parse_args()
    try:
        export(args.destination)
    except (OSError, ValueError):
        print("error: N5 synthetic export failed", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
