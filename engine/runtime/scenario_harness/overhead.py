"""Frozen five-pair process CPU/FPS measurement and separate callback diagnostics."""

import hashlib
import time
from pathlib import Path

from camera_trace import HostTraceRecording
from camera_trace_config import TraceConfig
from camera_trace_export import trace_bundle_bytes, write_trace_bundle
from camera_trace_hooks import install_host_trace

from .camera_runtime import LinuxCameraRuntime, WorkloadDeclaration
from .campaign_plan import validate
from .contracts import SECOND, Budget, RunFailure, RunPlan, Timeline
from .lease import RuntimeLease, restore_owned
from .manifest_export import json_bytes
from .output import write_atomic

ORDER = (
    ("disabled", "enabled"),
    ("enabled", "disabled"),
    ("disabled", "enabled"),
    ("enabled", "disabled"),
    ("disabled", "enabled"),
)


class TraceSwitch:
    def __init__(self, runtime):
        self.runtime, self.control = runtime, runtime.control

    def set(self, enabled, costs=None):
        control = self.control
        control._block_source()
        try:
            if not control.binding.closed:
                control.handoff = control.binding.retire()
                control.binding.recording.finish()
            if enabled:
                recording = HostTraceRecording(control.config)
                try:
                    binding = install_host_trace(
                        control.pipeline, recording, control.gst, control.handoff, costs
                    )
                except BaseException as exc:
                    failed = getattr(exc, "trace_binding", None)
                    if failed is not None:
                        control.failed_bindings.append(failed)
                    recording.finish("source_error")
                    raise
                if binding is None:
                    raise RunFailure("source_error")
                binding.control_owner = control
                control.binding = binding
                control.handoff = None
                return recording
            return None
        finally:
            control._unblock_source()


def run_overhead(camera, directory, plan, cancelled=lambda: False):
    validate(plan)
    if len(plan["trials"]) != 10 or any(
        t["scenario"] != "healthy" or t["assignment"] != "engineering" for t in plan["trials"]
    ):
        raise ValueError("explicit ten-trial engineering overhead schedule required")
    directory = Path(directory)
    with RuntimeLease(directory) as lease:
        if lease.journal is not None and lease.journal["state"] != "clean":
            raise ValueError("dirty ownership requires recovery")
        destination = directory / plan["campaign_id"]
        destination.mkdir(mode=0o700)
        write_atomic(destination / "overhead-plan.json", json_bytes(plan))
        if len(camera.peers) != 1:
            raise ValueError("one draining peer required")
        peer_id = next(iter(camera.peers))
        workload = getattr(camera, "N5_WORKLOAD_DECLARATION", None)
        if not isinstance(workload, WorkloadDeclaration) or (
            workload.workload_id,
            workload.seed,
            workload.node_version,
        ) != (plan["workload_id"], plan["seed"], plan["node_version"]):
            raise ValueError("explicit matching loaded workload declaration required")
        runtime = LinuxCameraRuntime(camera, peer_id, lease, workload)
        run_plan = RunPlan(
            "run-1",
            "healthy",
            plan["seed"],
            tuple(30 * SECOND for _ in range(6)),
            trace_config=TraceConfig(budget_ns=50_000_000),
        )
        timeline = Timeline(time.monotonic_ns)
        availability = runtime.preflight(
            run_plan, Budget(timeline, timeline.now() + 2 * SECOND, cancelled)
        )
        evidence = dict(
            schema_version="n4-overhead-evidence-v1",
            provenance="producer_capture",
            campaign_id=plan["campaign_id"],
            plan_sha256=hashlib.sha256(json_bytes(plan)).hexdigest(),
            core_version=plan["core_version"],
            producer_version=plan["producer_version"],
            runtime=dict(availability.runtime) if availability.runtime else None,
            state="unavailable",
            reason=availability.reason,
            trials=[],
            diagnostic=None,
            cleanup_verified=True,
        )
        if availability.state != "available":
            write_atomic(destination / "overhead-evidence.json", json_bytes(evidence))
            return evidence
        resources = runtime.prepare(run_plan)
        lease.begin(run_plan, resources)
        restored = False
        try:
            runtime.open(
                run_plan, resources, Budget(timeline, timeline.now() + 2 * SECOND, cancelled)
            )
            switch = TraceSwitch(runtime)
            total_budget = Budget(timeline, timeline.now() + 700 * SECOND, cancelled)

            def wait(seconds):
                runtime.wait_until(timeline.now() + seconds * SECOND, total_budget)

            def measure(enabled, costs=None):
                switch.set(enabled)
                warm_start = timeline.now()
                wait(10)
                warm_duration = timeline.now() - warm_start
                recording = switch.set(enabled, costs)
                start_frames = runtime.counters().frames
                cpu_start, wall_start = time.process_time_ns(), timeline.now()
                wait(30)
                cpu_end, wall_end = time.process_time_ns(), timeline.now()
                end_frames = runtime.counters().frames
                switch.set(False)
                return dict(
                    warmup_ns=warm_duration,
                    wall_ns=wall_end - wall_start,
                    cpu_ns=cpu_end - cpu_start,
                    frames_start=start_frames,
                    frames_end=end_frames,
                ), recording

            for pair, modes in enumerate(ORDER, 1):
                for mode in modes:
                    values, recording = measure(mode == "enabled")
                    trial = dict(
                        pair=pair,
                        mode=mode,
                        **values,
                        trace_file_name=None,
                        trace_bytes=0,
                        trace_sha256=None,
                        export_duration_ns=None,
                    )
                    evidence["trials"].append(trial)
                    if recording is not None:
                        payload = trace_bundle_bytes(
                            recording, plan["producer_version"], "producer_capture"
                        )
                        name = f"pair-{pair}-enabled.tar.gz"
                        start = time.monotonic_ns()
                        write_trace_bundle(destination / name, payload)
                        trial.update(
                            trace_file_name=name,
                            trace_bytes=len(payload),
                            trace_sha256=hashlib.sha256(payload).hexdigest(),
                            export_duration_ns=time.monotonic_ns() - start,
                        )
            # Ordinary enabled collection is the diagnostic baseline, not a disabled trial.
            baseline, _ = measure(True)
            from camera_trace_hooks import ProbeCosts

            costs = ProbeCosts()
            diagnostic, _ = measure(True, costs)
            samples, count = costs.snapshot()
            evidence["diagnostic"] = dict(
                baseline=baseline,
                measured=diagnostic,
                probe_durations_ns=samples,
                observed_probes=count,
            )
            evidence.update(state="completed", reason=None)
        except BaseException:
            evidence.update(state="failed", reason="cancelled" if cancelled() else "source_error")
        finally:
            cleanup_timeline = Timeline(time.monotonic_ns)
            restored, _ = restore_owned(
                resources, runtime, Budget(cleanup_timeline, cleanup_timeline.now() + 10 * SECOND)
            )
            try:
                lease.finish(restored)
            except BaseException:
                restored = False
            evidence["cleanup_verified"] = restored
            if not restored:
                evidence.update(state="failed", reason="cleanup_failed")
            write_atomic(destination / "overhead-evidence.json", json_bytes(evidence))
        return evidence
