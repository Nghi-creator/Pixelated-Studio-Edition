"""Frozen v1 predicates over private execution evidence; no artifact/hash proof."""

from dataclasses import dataclass

from .contracts import PHASES, SECOND, Execution, RunPlan, integer


@dataclass(frozen=True)
class MeasuredEffect:
    state: str
    reason: str | None
    healthy_fps: float | None = None
    degraded_fps: float | None = None
    recovery_fps: float | None = None
    pressure_cpu_percent: float | None = None


def evaluate_effect(plan, execution, *, adapter_available=True):
    """Integer comparisons decide thresholds; floats are presentation only.

    This checks raw evidence independently of injector startup. Step 6 must bind
    exported roots, hashes and ownership declarations before offline acceptance.
    """
    if not isinstance(plan, RunPlan) or not isinstance(execution, Execution):
        raise ValueError("approved plan and private execution required")
    if type(adapter_available) is not bool:
        raise ValueError("explicit adapter availability required")
    if not adapter_available:
        return MeasuredEffect("unavailable", "adapter_unavailable")
    if execution.status != "completed":
        return MeasuredEffect("unavailable", "incomplete_run")
    if execution.cleanup_state not in ("restored", "not_required"):
        return MeasuredEffect("unavailable", "cleanup_unverified")
    if tuple(p.phase for p in execution.phases) != PHASES:
        return MeasuredEffect("unavailable", "insufficient_evidence")
    totals = {}
    previous_end = previous_frame = None
    for phase in execution.phases:
        if phase.state != "complete" or phase.reason is not None:
            return MeasuredEffect("unavailable", "insufficient_evidence")
        cursor, frames, cpu, previous = phase.start_ns, 0, 0, None
        workers = plan.workers if phase.phase in ("degraded", "probe") else 0
        try:
            integer(phase.start_ns)
            integer(phase.end_ns)
            gap = phase.start_ns - previous_end if previous_end is not None else phase.start_ns
            if (
                not 0 <= gap <= 5 * SECOND
                or (phase.phase in ("warmup", "probe") and gap)
                or not SECOND <= phase.end_ns - phase.start_ns <= 302 * SECOND
                or phase.end_ns > 1200 * SECOND
            ):
                raise ValueError("invalid actual phase boundaries")
            if not isinstance(phase.intervals, tuple) or not 1 <= len(phase.intervals) <= 1200:
                raise ValueError("missing raw intervals")
            for row in phase.intervals:
                if not isinstance(row, tuple) or len(row) != 6:
                    raise ValueError("invalid raw interval")
                for value in row:
                    integer(value)
                start, end, before, after, active, used = row
                duration = end - start
                if (
                    start != cursor
                    or not SECOND // 2 <= duration <= 5 * SECOND
                    or end > phase.end_ns
                    or after < before
                    or (previous is not None and before != previous)
                    or (previous is None and previous_frame is not None and before < previous_frame)
                    or active != workers
                    or used > duration * active
                ):
                    raise ValueError("invalid raw coverage/ownership")
                cursor, previous = end, after
                frames += after - before
                cpu += used
            if cursor != phase.end_ns:
                raise ValueError("incomplete coverage")
        except (TypeError, ValueError):
            return MeasuredEffect("unavailable", "insufficient_evidence")
        totals[phase.phase] = (frames, phase.end_ns - phase.start_ns, cpu)
        previous_end, previous_frame = phase.end_ns, previous
        if phase.phase in ("healthy", "degraded", "recovery") and (
            len(phase.intervals) < 30 or phase.end_ns - phase.start_ns < 30 * SECOND
        ):
            return MeasuredEffect("unavailable", "insufficient_evidence")
    h, ht, _ = totals["healthy"]
    d, dt, dc = totals["degraded"]
    r, rt, _ = totals["recovery"]
    values = (
        h * SECOND / ht,
        d * SECOND / dt,
        r * SECOND / rt,
        dc * 100 / dt if plan.workers else None,
    )
    reason = None
    if h * SECOND < 27 * ht:
        reason = "baseline_inadequate"
    elif plan.workers:
        if dc * 100 < 50 * dt:
            reason = "pressure_not_observed"
        elif d * ht * 100 > 95 * h * dt:
            reason = "degradation_not_observed"
        elif r * ht * 100 < 95 * h * rt:
            reason = "recovery_not_observed"
    elif d * SECOND < 27 * dt:
        reason = "degradation_not_observed"
    elif r * SECOND < 27 * rt:
        reason = "recovery_not_observed"
    return MeasuredEffect("failed" if reason else "verified", reason, *values)
