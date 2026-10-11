"""Producer-local bounded lifecycle inputs; no detached-core dependency."""

import re
from dataclasses import dataclass

from camera_trace_config import TraceConfig

SECOND = 1_000_000_000
PHASES = ("warmup", "healthy", "degraded", "probe", "recovery", "cooldown")
MEASURED = PHASES[1:5]
SAFE_MAX = 2**53 - 1


class RunFailure(Exception):
    def __init__(self, reason):
        if reason not in (
            "cancelled",
            "timeout",
            "clock_error",
            "source_error",
            "action_failed",
            "cleanup_failed",
        ):
            raise ValueError("closed execution failure reason required")
        super().__init__(reason)
        self.reason = reason


def integer(value, low=0, high=SAFE_MAX):
    if type(value) is not int or not low <= value <= high:
        raise ValueError("bounded strict integer required")
    return value


@dataclass(frozen=True)
class RunPlan:
    run_id: str
    scenario: str
    seed: int
    durations_ns: tuple
    workers: int = 0
    trace_config: TraceConfig = TraceConfig()

    def __post_init__(self):
        if not isinstance(self.run_id, str) or not re.fullmatch(
            r"run-[1-9][0-9]{0,9}", self.run_id
        ):
            raise ValueError("sanitized run identity required")
        integer(int(self.run_id[4:]), 1, 2**31 - 1)
        if self.scenario not in ("healthy", "host_contention"):
            raise ValueError("only approved lifecycle scenarios are supported")
        integer(self.seed, 0, 2**32 - 1)
        if not isinstance(self.durations_ns, tuple) or len(self.durations_ns) != 6:
            raise ValueError("six immutable phase durations required")
        for duration in self.durations_ns:
            integer(duration, SECOND, 300 * SECOND)
        if sum(self.durations_ns) > 1200 * SECOND:
            raise ValueError("run exceeds watchdog")
        if not isinstance(self.trace_config, TraceConfig):
            raise ValueError("bounded existing N4 trace policy required")
        for duration in self.durations_ns[1:5]:
            denominator = SECOND * self.trace_config.every_nth_frame
            frames = (duration * 30 + denominator - 1) // denominator
            if (
                frames > self.trace_config.max_frames
                or 5 * frames > self.trace_config.max_events
            ):
                raise ValueError("planned phase exceeds frozen recording capacity")
        integer(self.workers, 0, 8)
        if self.scenario == "healthy" and self.workers:
            raise ValueError("healthy cannot request workers")
        if self.scenario == "host_contention" and (
            not self.workers
            or not 30 * SECOND <= sum(self.durations_ns[2:4]) <= 290 * SECOND
        ):
            raise ValueError("invalid pressure plan")


@dataclass(frozen=True)
class Resource:
    kind: str
    token: str
    generation: str

    def __post_init__(self):
        if self.kind not in ("workload", "recording", "pressure"):
            raise ValueError("unknown owned resource kind")
        for value in (self.token, self.generation):
            if not isinstance(value, str) or not re.fullmatch(r"[0-9a-f]{32}", value):
                raise ValueError("opaque ownership token required")


@dataclass(frozen=True)
class Counters:
    frames: int
    active_workers: int
    worker_cpu_ns: int

    def __post_init__(self):
        integer(self.frames)
        integer(self.active_workers, 0, 8)
        integer(self.worker_cpu_ns)


@dataclass(frozen=True)
class PhaseExecution:
    phase: str
    start_ns: int
    end_ns: int
    state: str
    reason: str | None
    intervals: tuple


@dataclass(frozen=True)
class Execution:
    status: str
    reason: str | None
    phases: tuple
    action_started_ns: int | None
    action_stopped_ns: int | None
    action_cleanup_started_ns: int | None
    action_cleanup_ended_ns: int | None
    cleanup_state: str
    cleanup_reason: str | None
    cleanup_started_ns: int
    cleanup_ended_ns: int
    resources: tuple


class Timeline:
    def __init__(self, clock):
        self.clock = clock
        self.last = None
        self.origin = None

    def now(self):
        try:
            value = self.clock()
            if type(value) is not int or value < 0:
                raise ValueError("monotonic clock requires a nonnegative integer")
        except Exception as exc:
            raise RunFailure("clock_error") from exc
        if self.last is not None and value < self.last:
            raise RunFailure("clock_error")
        self.last = value
        return value

    def offset(self):
        return self.now() - self.origin


class Budget:
    """Cooperative hook deadline; blocking foreign hooks cannot be preempted."""

    def __init__(self, timeline, deadline_ns, cancelled=lambda: False):
        self.timeline = timeline
        self.deadline_ns = deadline_ns
        self.cancelled = cancelled

    def check(self):
        if self.cancelled():
            raise RunFailure("cancelled")
        now = self.timeline.now()
        if now > self.deadline_ns:
            raise RunFailure("timeout")
        return self.deadline_ns - now
