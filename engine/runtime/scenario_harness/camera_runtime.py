"""Opt-in in-process Linux camera adapter. Never imports/starts camera on import."""

import math
import os
import re
import sys
import time
import uuid
from dataclasses import asdict, dataclass
from pathlib import Path

from camera_trace_control import PeerRecordingControl
from camera_trace_hooks import HostTraceBinding

from .contracts import SECOND, Counters, Resource, RunFailure, integer
from .pressure import LinuxProcesses, PressureWorkers


@dataclass(frozen=True)
class WorkloadDeclaration:
    """Trusted campaign owner's preloaded workload identity, seed and fixed profile.

    This is a declaration, not inferred proof of screen content. The adapter owns
    no scene launcher; a campaign must keep its declared workload stable.
    """

    workload_id: str
    seed: int
    node_version: str

    def __post_init__(self):
        if not isinstance(self.workload_id, str) or not re.fullmatch(
            r"workload-[1-9][0-9]{0,9}", self.workload_id
        ):
            raise ValueError("sanitized declared workload required")
        integer(int(self.workload_id[9:]), 1, 2**31 - 1)
        integer(self.seed, 0, 2**32 - 1)
        if not isinstance(self.node_version, str) or not re.fullmatch(
            r"(?:0|[1-9][0-9]{0,2})(?:\.(?:0|[1-9][0-9]{0,2})){1,3}", self.node_version
        ):
            raise ValueError("campaign owner must declare actual Node version")


@dataclass(frozen=True)
class Availability:
    state: str
    reason: str | None
    runtime: tuple = ()


def cpu_allocation():
    """Affinity intersected with every visible cgroup v2 ancestor quota.

    A hidden/unsupported hierarchy fails closed rather than guessing host CPUs.
    """
    affinity = len(os.sched_getaffinity(0))
    rows = Path("/proc/self/cgroup").read_text().splitlines()
    unified = [row[3:] for row in rows if row.startswith("0::")]
    if len(unified) != 1 or not unified[0].startswith("/"):
        raise ValueError("observable cgroup v2 allocation required")
    parts = Path(unified[0]).parts[1:]
    if any(part in ("..", ".") for part in parts):
        raise ValueError("unsafe cgroup path")
    root = Path("/sys/fs/cgroup")
    for count in range(len(parts) + 1):
        path = root.joinpath(*parts[:count], "cpu.max")
        # The cgroup v2 host root has no quota file; namespace roots may have one.
        if count == 0 and not path.exists():
            if not root.joinpath("cgroup.controllers").is_file():
                raise ValueError("cgroup v2 mount unavailable")
            continue
        quota, period = path.read_text().split()
        if quota != "max":
            amount, width = int(quota), int(period)
            if amount <= 0 or width <= 0:
                raise ValueError("invalid CPU quota")
            affinity = min(affinity, amount // width)
    return integer(affinity, 1, 64)


class LinuxCameraRuntime:
    """Exact existing peer/pipeline owner; invoked only from a trusted control thread."""

    def __init__(self, camera, peer_id, lease, workload):
        if not isinstance(workload, WorkloadDeclaration):
            raise ValueError("explicit workload declaration required")
        self.camera, self.peer_id, self.lease, self.workload = camera, peer_id, lease, workload
        self.peer = self.pipeline = self.control = self.workers = None
        self.resources = None
        self.availability = None
        self.frozen_recordings = []
        self.cleanup_clock = time.monotonic_ns
        self.profile = None
        self.plan = None
        self.initial_binding = None

    def _snapshot(self):
        peers, gst = self.camera.peers, self.camera.Gst
        if len(peers) != 1 or self.peer_id not in peers:
            raise ValueError("one exact peer required")
        peer = peers[self.peer_id]
        if self.peer is not None and (
            peer is not self.peer or peer["pipeline"] is not self.pipeline
        ):
            raise ValueError("peer generation changed")
        pipeline = peer["pipeline"]
        _, state, pending = pipeline.get_state(0)
        if state != gst.State.PLAYING or pending != gst.State.VOID_PENDING:
            raise ValueError("pipeline not stably playing")
        source, encoder, transport = (
            pipeline.get_by_name(name) for name in ("video_capture", "video_encoder", "sendrecv")
        )
        if any(value is None for value in (source, encoder, transport)):
            raise ValueError("required elements missing")
        if (
            source.get_factory().get_name() != "ximagesrc"
            or encoder.get_factory().get_name() != "vp8enc"
        ):
            raise ValueError("unsupported capture/codec")
        if source.get_property("display-name") != ":99":
            raise ValueError("declared Xvfb display required")
        connection = transport.get_property("connection-state")
        if connection.value_nick != "connected":
            raise ValueError("peer not draining")
        caps = encoder.get_static_pad("sink").get_current_caps()
        structure = caps.get_structure(0)
        ok, numerator, denominator = structure.get_fraction("framerate")
        if not ok or (
            structure.get_value("width"),
            structure.get_value("height"),
            numerator,
            denominator,
        ) != (1280, 720, 30, 1):
            raise ValueError("fixed 1280x720/30 workload required")
        # Verify actual audio source too, without process-name scans or new probes.
        iterator = pipeline.iterate_elements()
        pulse = False
        for _ in range(64):
            result, element = iterator.next()
            if result == gst.IteratorResult.DONE:
                break
            if result != gst.IteratorResult.OK:
                raise ValueError("unstable element inventory")
            factory = element.get_factory()
            if factory is not None and factory.get_name() == "pulsesrc":
                pulse = element.get_property("device") == "auto_null.monitor"
        else:
            raise ValueError("element inventory exceeds bound")
        if not pulse:
            raise ValueError("PulseAudio monitor source required")
        properties = tuple(
            encoder.get_property(name)
            for name in (
                "deadline",
                "cpu-used",
                "threads",
                "end-usage",
                "target-bitrate",
                "max-quantizer",
                "min-quantizer",
                "keyframe-max-dist",
                "error-resilient",
            )
        )
        signature = (tuple(sorted(peer["stream_profile"].items())), properties)
        if self.profile is not None and signature != self.profile:
            raise ValueError("workload configuration changed")
        return peer, pipeline, signature, integer(peer["frames_out_total"])

    def preflight(self, plan, budget):
        """Read-only availability before runner intent; never starts pressure."""
        if self.resources is not None:
            raise ValueError("preflight cannot replace a prepared runtime")
        reason = "runtime_unavailable"
        try:
            budget.check()
            if sys.platform != "linux":
                raise ValueError("Linux runtime required")
            allocation = cpu_allocation()
            if plan.workers > allocation:
                raise ValueError("workers exceed actual allocation")
            if plan.workers:
                processes = LinuxProcesses()
                fd = processes.pin(os.getpid())
                try:
                    processes.identity(os.getpid())
                finally:
                    processes.close(fd)
            reason = "clock_unavailable"
            clock = time.get_clock_info("monotonic")
            if not clock.monotonic or clock.adjustable or not math.isfinite(clock.resolution):
                raise ValueError("monotonic measurement source required")
            resolution = max(1, math.ceil(clock.resolution * SECOND))
            reason = "source_unavailable"
            if plan.seed != self.workload.seed:
                raise ValueError("workload seed differs from campaign")
            peer, pipeline, signature, before = self._snapshot()
            binding = peer.get("stage_trace")
            if (
                not isinstance(binding, HostTraceBinding)
                or binding.closed
                or getattr(binding, "control_owner", None) is not None
                or isinstance(binding, PeerRecordingControl)
            ):
                raise ValueError("opted-in tracing required")
            end = min(budget.deadline_ns, budget.timeline.now() + SECOND)
            while self._snapshot()[3] <= before:
                if budget.timeline.now() >= end:
                    raise ValueError("no observed encoder progress")
                time.sleep(min(0.01, budget.check() / SECOND))
            budget.check()
            self.peer, self.pipeline, self.profile = peer, pipeline, signature
            self.initial_binding = binding
            versions = self.camera.Gst.version()
            runtime = tuple(
                dict(
                    kind="linux_x11",
                    python_version=".".join(map(str, sys.version_info[:3])),
                    node_version=self.workload.node_version,
                    gst_version=".".join(map(str, versions)),
                    cpu_allocation=allocation,
                    width=1280,
                    height=720,
                    fps=30,
                    codec="vp8",
                    clock_source="python_monotonic_ns",
                    clock_resolution_ns=resolution,
                ).items()
            )
            self.availability = Availability("available", None, runtime)
            self.plan = plan
        except PermissionError:
            self.availability = Availability("unavailable", "permission_denied")
        except (ValueError, OSError, AttributeError, KeyError, TypeError):
            self.availability = Availability("unavailable", reason)
        return self.availability

    def prepare(self, plan):
        if (
            self.resources is not None
            or self.availability is None
            or self.availability.state != "available"
        ):
            raise ValueError("single-use runtime requires successful actual preflight")
        if plan != self.plan:
            raise ValueError("preflight plan changed")
        self.resources = tuple(
            Resource(kind, uuid.uuid4().hex, uuid.uuid4().hex)
            for kind in ["workload", "recording"] + ["pressure"] * plan.workers
        )
        return self.resources

    def open(self, plan, resources, budget):
        budget.check()
        if (
            plan != self.plan
            or resources != self.resources
            or self.lease.journal is None
            or self.lease.journal["state"] != "active"
            or self.lease.journal["run_id"] != plan.run_id
            or self.lease.journal["resources"] != [asdict(r) for r in resources]
        ):
            raise ValueError("durable exact intent required")
        self._snapshot()
        if cpu_allocation() != dict(self.availability.runtime)["cpu_allocation"]:
            raise ValueError("CPU allocation changed")
        self.workers = PressureWorkers(self.lease, resources) if plan.workers else None
        self.control = self.camera.create_peer_recording_control(self.peer_id, plan.trace_config)
        budget.check()

    def start_action(self, plan, budget):
        return self.workers.start(sum(plan.durations_ns[2:4]) + 10 * SECOND, budget)

    def stop_action(self, budget):
        return self.workers.stop(budget)

    def start_recording(self, phase, budget):
        budget.check()
        self.control.start_phase(phase)
        budget.check()

    def finish_recording(self, phase, budget):
        budget.check()
        self.frozen_recordings.append((phase, self.control.finish_phase(phase)))
        budget.check()

    def wait_until(self, deadline, budget):
        while True:
            remaining = budget.check()
            delay = deadline - budget.timeline.now()
            if delay <= 0:
                return
            if not remaining:
                raise RunFailure("timeout")
            time.sleep(min(delay / SECOND, remaining / SECOND, 0.02))

    def counters(self):
        _, _, _, frames = self._snapshot()
        if cpu_allocation() != dict(self.availability.runtime)["cpu_allocation"]:
            raise RunFailure("source_error")
        active, cpu = self.workers.counters() if self.workers is not None else (0, 0)
        return Counters(frames, active, cpu)

    def owns(self, resource):
        if self.resources is None or resource not in self.resources:
            return False
        if resource.kind == "pressure":
            return self.workers is None or self.workers.owns(resource)
        peer = self.camera.peers.get(self.peer_id)
        if resource.kind == "recording" and self.control is None:
            return (
                peer is self.peer
                and peer.get("stage_trace") is self.initial_binding
                and not self.initial_binding.closed
                and getattr(self.initial_binding, "control_owner", None) is None
            )
        return (
            len(self.camera.peers) == 1
            and peer is self.peer
            and peer["pipeline"] is self.pipeline
            and (self.control is None or peer["stage_trace"] is self.control)
        )

    def restore(self, resource, budget):
        budget.check()
        if resource.kind == "pressure":
            return self.workers is None or self.workers.restore(resource, budget)
        if not self.owns(resource):
            return False
        # Existing workload stays under its campaign owner; no settings were mutated.
        return self.control is None or self.control.close("completed")
