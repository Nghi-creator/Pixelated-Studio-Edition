"""Bounded synchronous orchestration through explicit cooperative runtime hooks."""

import time
from contextlib import suppress

from .contracts import (
    MEASURED,
    PHASES,
    SECOND,
    Budget,
    Counters,
    Execution,
    PhaseExecution,
    Resource,
    RunFailure,
    RunPlan,
    Timeline,
)
from .lease import restore_owned


class ScenarioRunner:
    def __init__(
        self, lease, runtime, clock=time.monotonic_ns, cancelled=lambda: False
    ):
        self.lease = lease
        self.runtime = runtime
        self.timeline = Timeline(clock)
        self.cancelled = cancelled
        self.used = False

    def run(self, plan):
        if self.used or not isinstance(plan, RunPlan):
            raise ValueError("single-use runner and approved immutable plan required")
        self.used = True
        # prepare allocates identities only: no children, recordings or settings mutations.
        resources = self.runtime.prepare(plan)
        if (
            not isinstance(resources, tuple)
            or any(not isinstance(r, Resource) for r in resources)
            or sum(r.kind == "pressure" for r in resources) != plan.workers
            or sum(r.kind == "recording" for r in resources) != 1
            or sum(r.kind == "workload" for r in resources) != 1
        ):
            raise ValueError("exact workload/recording/worker inventory required")
        self.resources = resources
        self.lease.begin(
            plan, resources
        )  # Durable intent precedes every runtime mutation.
        phases, started, stopped, status, reason = [], None, None, "completed", None
        action_cleanup_start = action_cleanup_end = None
        t = self.timeline
        current = None
        intervals = []
        start = 0
        try:
            setup_budget = Budget(t, t.now() + 2 * SECOND, self.cancelled)
            setup_budget.check()
            self.runtime.open(plan, resources, setup_budget)
            setup_budget.check()
            t.origin = t.now()  # Warmup begins after bounded runtime initialization.
            run_budget = Budget(t, t.origin + 1200 * SECOND, self.cancelled)
            boundary = 0
            carried = None
            for index, phase in enumerate(PHASES):
                current, intervals = None, []
                transition_deadline = t.origin + boundary + 5 * SECOND
                transition = Budget(
                    t, min(run_budget.deadline_ns, transition_deadline), self.cancelled
                )
                transition.check()
                if phase == "degraded" and plan.workers:
                    action_budget = Budget(
                        t,
                        min(transition.deadline_ns, t.origin + boundary + 10 * SECOND),
                        self.cancelled,
                    )
                    started = (
                        t.offset()
                    )  # Retain attempted ownership even if startup fails.
                    try:
                        if self.runtime.start_action(plan, action_budget) is not True:
                            raise RunFailure("action_failed")
                    except RunFailure:
                        raise
                    except Exception as exc:
                        raise RunFailure("action_failed") from exc
                    action_budget.check()
                if phase == "recovery" and plan.workers:
                    transition = Budget(
                        t,
                        min(
                            transition.deadline_ns,
                            t.origin
                            + started
                            + sum(plan.durations_ns[2:4])
                            + 10 * SECOND,
                        ),
                        self.cancelled,
                    )
                    action_cleanup_start = t.offset()
                    try:
                        if self.runtime.stop_action(transition) is not True:
                            raise RunFailure("cleanup_failed")
                        stopped = t.offset()
                        transition.check()
                        pressure = tuple(r for r in resources if r.kind == "pressure")
                        restored, _reason = restore_owned(
                            pressure, self.runtime, transition
                        )
                        if not restored:
                            raise RunFailure("cleanup_failed")
                        action_cleanup_end = t.offset()
                        transition.check()
                    except RunFailure:
                        raise
                    except Exception as exc:
                        raise RunFailure("cleanup_failed") from exc
                if phase in MEASURED:
                    self.runtime.start_recording(phase, transition)
                    transition.check()
                # Probe starts at the actual degraded end. Rotation latency belongs to probe;
                # this is a continuous counter window, not a bridged N4 recording clock.
                start = boundary if phase in ("warmup", "probe") else t.offset()
                if phase == "warmup" and t.offset() > 2 * SECOND:
                    raise RunFailure("timeout")
                current = phase
                cursor = start
                previous = carried if phase == "probe" else self._counters(plan, phase)
                end_target = start + plan.durations_ns[index]
                deadline_ns = min(
                    run_budget.deadline_ns, t.origin + end_target + 2 * SECOND
                )
                if plan.workers and phase in ("degraded", "probe"):
                    deadline_ns = min(
                        deadline_ns,
                        t.origin + started + sum(plan.durations_ns[2:4]) + 10 * SECOND,
                    )
                phase_budget = Budget(t, deadline_ns, self.cancelled)
                while cursor < end_target:
                    phase_budget.check()
                    remaining = end_target - cursor
                    deadline = (
                        end_target
                        if remaining <= SECOND + SECOND // 2
                        else cursor + SECOND
                    )
                    self.runtime.wait_until(t.origin + deadline, phase_budget)
                    phase_budget.check()
                    # The receipt time must include the counter read itself. Reading
                    # worker CPU after the wall timestamp can report >100% in a fully
                    # saturated first interval even when the raw clocks are valid.
                    counters = self._counters(plan, phase)
                    observed = t.offset()
                    if observed < deadline:
                        raise RunFailure("source_error")
                    wall = observed - cursor
                    if not SECOND // 2 <= wall <= 5 * SECOND:
                        raise RunFailure("source_error")
                    delta_cpu = counters.worker_cpu_ns - previous.worker_cpu_ns
                    if counters.frames < previous.frames or delta_cpu < 0:
                        raise RunFailure("source_error")
                    if (
                        counters.active_workers != previous.active_workers
                        or delta_cpu > wall * counters.active_workers
                    ):
                        raise RunFailure("source_error")
                    intervals.append(
                        (
                            cursor,
                            observed,
                            previous.frames,
                            counters.frames,
                            counters.active_workers,
                            delta_cpu,
                        )
                    )
                    previous, cursor = counters, observed
                boundary = cursor
                carried = previous
                phases.append(
                    PhaseExecution(
                        phase, start, boundary, "complete", None, tuple(intervals)
                    )
                )
                current = None
                if phase in MEASURED:
                    self.runtime.finish_recording(phase, phase_budget)
                    phase_budget.check()
                if (
                    phase == "probe"
                    and plan.workers
                    and started is not None
                    and t.offset() - started > sum(plan.durations_ns[2:4]) + 10 * SECOND
                ):
                    raise RunFailure("timeout")
            run_budget.check()
        except BaseException as exc:
            status = "aborted"
            reason = (
                exc.reason
                if isinstance(exc, RunFailure)
                else "cancelled"
                if isinstance(exc, (KeyboardInterrupt, SystemExit))
                else "source_error"
            )
            if current is not None:
                # Preserve covered prefix; no extrapolated counters for the uncovered tail.
                end = max(start, intervals[-1][1] if intervals else start)
                # A regressed clock cannot extend the retained covered prefix.
                with suppress(RunFailure):
                    end = max(end, t.offset())
                phases.append(
                    PhaseExecution(
                        current, start, end, "partial", reason, tuple(intervals)
                    )
                )
        # Cleanup uses a fresh monotonic timeline so a regressed measurement clock cannot
        # prevent bounded ownership recovery. Failed measurement offsets are not repaired.
        try:
            cleanup_timeline = Timeline(self.runtime.cleanup_clock)
            cleanup_start = cleanup_timeline.now()
            cleanup_budget = Budget(cleanup_timeline, cleanup_start + 10 * SECOND)
            # Aborts also stop owned actions. Preserve their cleanup receipt when
            # the original measurement clock is still trustworthy; never repair it.
            if started is not None and stopped is None:
                with suppress(RunFailure):
                    action_cleanup_start = t.offset()
            restored, cleanup_reason = restore_owned(
                resources, self.runtime, cleanup_budget
            )
            cleanup_end = cleanup_timeline.now()
            if cleanup_end - cleanup_start > 10 * SECOND:
                restored, cleanup_reason = False, "restore_failed"
            if restored and started is not None and stopped is None:
                with suppress(RunFailure):
                    action_cleanup_end = stopped = t.offset()
        except BaseException:
            cleanup_start = cleanup_end = 0
            restored, cleanup_reason = False, "missing_evidence"
        try:
            self.lease.finish(restored)
        except BaseException:
            restored, cleanup_reason = False, "missing_evidence"
        if not restored:
            status, reason = "aborted", "cleanup_failed"
        return Execution(
            status,
            reason,
            tuple(phases),
            started,
            stopped,
            action_cleanup_start,
            action_cleanup_end,
            "restored" if restored else "unverified",
            cleanup_reason,
            cleanup_start,
            cleanup_end,
            resources,
        )

    def _counters(self, plan, phase):
        for resource in self.resources:
            if (
                resource.kind != "pressure" or phase in ("degraded", "probe")
            ) and self.runtime.owns(resource) is not True:
                raise RunFailure(
                    "action_failed" if resource.kind == "pressure" else "source_error"
                )
        counters = self.runtime.counters()
        if not isinstance(counters, Counters):
            raise RunFailure("source_error")
        workers = plan.workers if phase in ("degraded", "probe") else 0
        if counters.active_workers != workers:
            raise RunFailure("action_failed")
        return counters
