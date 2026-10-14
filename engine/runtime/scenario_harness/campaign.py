"""Single-owner in-process campaign execution outside the camera/GLib callbacks."""

import hashlib
import os
import stat
import threading
import time
from contextlib import suppress
from pathlib import Path

from camera_trace_config import TraceConfig
from camera_trace_control import PeerRecordingControl

from .camera_runtime import Availability, LinuxCameraRuntime, WorkloadDeclaration
from .campaign_plan import decode, validate
from .contracts import PHASES, SECOND, Budget, RunPlan, Timeline
from .export import experiment_bundle_bytes, write_experiment_bundle
from .lease import RuntimeLease
from .manifest_export import json_bytes
from .output import write_atomic
from .pacing_export import pacing_bundle_bytes
from .pacing_runtime import PacingCameraRuntime
from .runner import ScenarioRunner


def read_private(directory, name):
    parent = os.open(directory, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        info = os.fstat(parent)
        if info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != 0o700:
            raise ValueError("owned private campaign directory required")
        fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=parent)
        try:
            info = os.fstat(fd)
            if (
                not stat.S_ISREG(info.st_mode)
                or info.st_uid != os.getuid()
                or stat.S_IMODE(info.st_mode) != 0o600
                or info.st_nlink != 1
            ):
                raise ValueError("private regular campaign file required")
            with os.fdopen(fd, "rb", closefd=False) as source:
                data = source.read(65537)
            if len(data) > 65536:
                raise ValueError("campaign input exceeds bound")
            return data
        finally:
            os.close(fd)
    finally:
        os.close(parent)


def manifest_for(campaign, trial, plan, availability):
    pacing = trial["scenario"] == "render_capture_slowdown"
    runtime = dict(availability.runtime)
    if not runtime:
        raise ValueError("observed runtime metadata required")
    actions = (
        [
            dict(
                action_id="action-1",
                kind="capture_pacing" if pacing else "cpu_pressure",
                start_phase="degraded",
                stop_phase="recovery",
                workers=0 if pacing else plan.workers,
                max_duration_ns=70 * SECOND,
            )
        ]
        if pacing or plan.workers
        else []
    )
    if pacing:
        actions[0]["delay_us"] = 50000
    return dict(
        schema_version="experiment-manifest-v2" if pacing else "experiment-manifest-v1",
        method_release="n5-capture-pacing-v1" if pacing else "n5-single-cause-v1",
        experiment_id="experiment-" + campaign["campaign_id"].split("-")[1],
        run_id=trial["run_id"],
        node_id=campaign["node_id"],
        workload_id=campaign["workload_id"],
        clock_id="clock-1",
        provenance="producer_capture",
        scenario=trial["scenario"],
        seed=campaign["seed"],
        repeat_index=trial["repeat_index"],
        assignment=trial["assignment"],
        core_version=campaign["core_version"],
        producer_version=campaign["producer_version"],
        runtime=runtime,
        adapter=dict(
            adapter_id="bounded_capture_pacing"
            if pacing
            else "bounded_cpu_pressure"
            if plan.workers
            else "none",
            state=availability.state,
            reason=availability.reason,
        ),
        phases=[
            dict(phase=p, duration_ns=d) for p, d in zip(PHASES, plan.durations_ns, strict=True)
        ],
        actions=actions,
        trace_policy=dict(scope="per_phase", every_nth_frame=1, max_frames=2000, max_events=10000),
    )


class CampaignExecutor:
    def __init__(self, camera, directory, cancelled=lambda: False, runtime_factory=None):
        self.camera, self.directory, self.cancelled = camera, Path(directory), cancelled
        self.runtime_factory = runtime_factory

    def run(self, campaign):
        validate(campaign)
        with RuntimeLease(self.directory) as lease:
            destination = self.directory / campaign["campaign_id"]
            destination.mkdir(mode=0o700)  # Never overwrite/replay a prior acquisition schedule.
            write_atomic(destination / "campaign-plan.json", json_bytes(campaign))
            index = dict(
                schema_version="n5-campaign-index-v1",
                campaign_id=campaign["campaign_id"],
                plan_sha256=hashlib.sha256(json_bytes(campaign)).hexdigest(),
                state="running",
                trials=[],
            )
            origin = time.monotonic_ns()
            if lease.journal is not None and lease.journal["state"] != "clean":
                raise ValueError("dirty prior ownership requires explicit recovery")
            try:
                for trial in campaign["trials"]:
                    if self.cancelled():
                        index["state"] = "cancelled"
                        break
                    peers = tuple(self.camera.peers)
                    if len(peers) != 1:
                        index["state"] = "source_unavailable"
                        break
                    peer_id = peers[0]
                    plan = RunPlan(
                        trial["run_id"],
                        "host_contention" if trial["scenario"] == "host_contention" else "healthy",
                        campaign["seed"],
                        tuple(s * SECOND for s in (10, 30, 30, 30, 30, 10)),
                        campaign["host_workers"] if trial["scenario"] == "host_contention" else 0,
                        TraceConfig(budget_ns=50_000_000),
                    )
                    factory = self.runtime_factory or (
                        PacingCameraRuntime
                        if trial["scenario"] == "render_capture_slowdown"
                        else LinuxCameraRuntime
                    )
                    workload = getattr(self.camera, "N5_WORKLOAD_DECLARATION", None)
                    if not isinstance(workload, WorkloadDeclaration) or (
                        workload.workload_id,
                        workload.seed,
                        workload.node_version,
                    ) != (campaign["workload_id"], campaign["seed"], campaign["node_version"]):
                        availability = Availability("unavailable", "source_unavailable")
                        runtime = None
                    else:
                        runtime = factory(self.camera, peer_id, lease, workload)
                        timeline = Timeline(time.monotonic_ns)
                        availability = runtime.preflight(
                            plan, Budget(timeline, timeline.now() + 2 * SECOND, self.cancelled)
                        )
                    if availability.state == "unavailable":
                        index["trials"].append(
                            dict(
                                run_id=trial["run_id"],
                                source_id=trial["source_id"],
                                status="unavailable",
                                reason=availability.reason,
                                file_name=None,
                                bytes=0,
                                sha256=None,
                                acquisition_started_ns=None,
                                acquisition_ended_ns=None,
                            )
                        )
                        index["state"] = "trial_failed"
                        break
                    declaration = manifest_for(campaign, trial, plan, availability)
                    begin = time.monotonic_ns() - origin
                    runner = ScenarioRunner(lease, runtime, cancelled=self.cancelled)
                    if isinstance(runtime, PacingCameraRuntime):
                        runtime.offset = runner.timeline.offset
                    execution = runner.run(plan)
                    if trial["scenario"] == "render_capture_slowdown":
                        payload = pacing_bundle_bytes(
                            declaration,
                            plan,
                            execution,
                            recordings=runtime.frozen_recordings,
                            action_started_ns=runtime.action_started_ns,
                            action_stopped_ns=runtime.action_stopped_ns,
                            cleanup_ended_ns=runtime.cleanup_ended_ns,
                            restored=runtime.pacing_restored,
                        )
                    else:
                        payload = experiment_bundle_bytes(
                            declaration, plan, execution, recordings=runtime.frozen_recordings
                        )
                    end = time.monotonic_ns() - origin
                    name = trial["run_id"] + ".tar.gz"
                    write_experiment_bundle(destination / name, payload)
                    index["trials"].append(
                        dict(
                            run_id=trial["run_id"],
                            source_id=trial["source_id"],
                            status="exported",
                            reason=None,
                            file_name=name,
                            bytes=len(payload),
                            sha256=hashlib.sha256(payload).hexdigest(),
                            acquisition_started_ns=begin,
                            acquisition_ended_ns=end,
                        )
                    )
                    write_atomic(destination / "campaign-index.json", json_bytes(index))
                    if (
                        execution is None
                        or execution.status != "completed"
                        or execution.cleanup_state != "restored"
                    ):
                        index["state"] = "trial_failed"
                        break
                    # A new warm-up binding retains the source admission floor but no old frames.
                    control = self.camera.peers[peer_id]["stage_trace"]
                    if (
                        not isinstance(control, PeerRecordingControl)
                        or control is not runtime.control
                    ):
                        raise ValueError("recording ownership changed")
                    if len(index["trials"]) < len(campaign["trials"]):
                        self.camera.peers[peer_id]["stage_trace"] = control.rearm()
                else:
                    index["state"] = "finished"
            except BaseException:
                index["state"] = "campaign_failed"
        write_atomic(destination / "campaign-index.json", json_bytes(index))
        return index


class CampaignService:
    def __init__(self, camera, directory):
        self.camera, self.directory = camera, Path(directory)
        self.shutdown = threading.Event()
        self.thread = threading.Thread(target=self._run, name="n5-campaign-control", daemon=True)

    def start(self):
        self.thread.start()

    def close(self):
        self.shutdown.set()
        self.thread.join(12)
        return not self.thread.is_alive()

    def cancelled(self):
        if self.shutdown.is_set():
            return True
        try:
            return read_private(self.directory, "cancel.json") == b'{"cancel":true}\n'
        except FileNotFoundError:
            return False
        except (OSError, ValueError):
            return True

    def _run(self):
        # One submission per camera lifetime avoids ambiguous replay or automatic recovery.
        while not self.shutdown.wait(0.2):
            requests = []
            for name in ("request.json", "overhead-request.json"):
                try:
                    requests.append((name, read_private(self.directory, name)))
                except FileNotFoundError:
                    continue
                except (OSError, ValueError):
                    return  # Invalid ownership never writes into a foreign directory.
            if not requests:
                continue
            try:
                if len(requests) != 1:
                    raise ValueError("one immutable request required")
                name, request = requests[0]
                campaign = decode(request)
                if name == "overhead-request.json":
                    from .overhead import run_overhead

                    run_overhead(self.camera, self.directory, campaign, self.cancelled)
                else:
                    CampaignExecutor(self.camera, self.directory, self.cancelled).run(campaign)
            except BaseException:
                with suppress(OSError, ValueError):
                    write_atomic(
                        self.directory / "service-error.json", b'{"error":"campaign_failed"}\n'
                    )
            return
