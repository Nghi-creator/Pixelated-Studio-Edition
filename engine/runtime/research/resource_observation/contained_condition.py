"""Opt-in condition observer extension; no launcher mode or collection authority."""

import hashlib
import json
from dataclasses import asdict

from condition_observation import ConditionObservation

from .cgroup_cpu import CgroupCpuSampler

METHOD = "n11-contained-condition-resource-candidate-v1"
ERROR = "invalid_contained_resource_observation"
PHASES = ("healthy", "degraded", "relief", "recovery", "post")


class _ReferencePending(Exception):
    """Internal control flow: retain collected reference rows until read spans suffice."""


class ResourceConditionObservation(ConditionObservation):
    """Add independent CPU reads to the existing reference/native sample seam.

    Imports require the contained fixture's n10 script path, like its other
    observers. The launcher must select a separate versioned mode/inspector;
    ordinary condition observations and worker schemas are not changed.
    """

    method = METHOD

    def __init__(self, *args, sampler_factory=CgroupCpuSampler, **kwargs):
        super().__init__(*args, **kwargs)
        self._resource_factory = sampler_factory
        self._resource_sampler = self._resource_context = None
        self._resource_failed = False
        self._resource_last_end = self._resource_last_phase = None
        self._resource_upstream_emit = self.emit
        self.emit = self._resource_emit

    def reference(self, now):
        try:
            return super().reference(now)
        except _ReferencePending:
            # The base emits before clearing its row buffer or advancing stage.
            return False

    def _reference_read_spans_ready(self, rows):
        if not isinstance(rows, list) or len(rows) > 64:
            raise ValueError(ERROR)
        if len(rows) < 4:
            return False
        first, last = rows[0], rows[-1]
        ready = True
        for key in ("container_cpu_read", "native_read"):
            left, right = first[key], last[key]
            if left["clock_id"] != right["clock_id"]:
                raise ValueError(ERROR)
            inner = right["read_start_ns"] - left["read_end_ns"]
            outer = right["read_end_ns"] - left["read_start_ns"]
            if inner < 0 or outer > 5_000_000_000:
                raise ValueError(ERROR)
            ready = ready and inner >= 2_000_000_000
        return ready

    def _resource_emit(self, kind, **fields):
        if kind == "n11_pacing_reference":
            try:
                if self._resource_failed or fields.get("phase") not in ("healthy", "post"):
                    raise ValueError(ERROR)
                if not self._reference_read_spans_ready(fields.get("samples")):
                    raise _ReferencePending()
            except _ReferencePending:
                raise
            except Exception:
                self._resource_failed = True
                raise ValueError(ERROR) from None
        if kind == "n11_pair_phase_completed":
            try:
                # Base tick captured `now` before the added CPU read. Publish the
                # actual completion after that read, on this controller clock.
                now = self.now()
                if (
                    self._resource_failed
                    or self._resource_last_end is None
                    or self._resource_last_phase != fields.get("phase")
                    or now - self.origin < self._resource_last_end
                    or now < self.stage_start
                    or fields.get("phase") not in PHASES[1:4]
                    or now - self.stage_start > 4_500_000_000
                ):
                    raise ValueError(ERROR)
                fields["at_ns"] = now - self.origin
                if fields.get("phase") == "relief":
                    elapsed = now - self.dispatched_at
                    if elapsed >= 5_000_000_000:
                        raise ValueError(ERROR)
                    fields["action_elapsed_ns"] = elapsed
            except Exception:
                self._resource_failed = True
                raise ValueError(ERROR) from None
        self._resource_upstream_emit(kind, **fields)

    def native_read_evidence(self, slot, observation):
        if self._resource_failed:
            raise ValueError(ERROR)
        try:
            native = super().native_read_evidence(slot, observation)
            if self.pacing_stage in ("healthy", "post"):
                phase = self.pacing_stage
            elif self.pacing_stage == "pair" and self.stage == "measure":
                phase = self.phase
            else:
                raise ValueError(ERROR)
            if phase not in PHASES:
                raise ValueError(ERROR)
            context = dict(
                method=METHOD,
                generation=asdict(slot.owner.generation),
                controller_origin_ns=str(self.origin),
            )
            clock_id = (
                "controller-monotonic-"
                + hashlib.sha256(
                    json.dumps(context, sort_keys=True, separators=(",", ":")).encode()
                ).hexdigest()
            )
            if self._resource_sampler is None:
                self._resource_context = context
                self.emit(
                    "n11_resource_context",
                    method=METHOD,
                    clock_id=clock_id,
                    context=context,
                    live_authority=False,
                )
                self._resource_sampler = self._resource_factory(
                    clock_id=clock_id,
                    expected_quota_us=200000,
                    expected_period_us=100000,
                    clock=lambda: self.now() - self.origin,
                )
            if context != self._resource_context:
                raise ValueError(ERROR)
            sample = self._resource_sampler.sample()
            if sample.get("clock_id") != clock_id or sample.get("quota") != dict(
                quota_usec=200000, period_usec=100000
            ):
                raise ValueError(ERROR)
            if (
                self.condition_started
                and not self.condition_cleanup
                and self.now() - self.condition_started_at >= 20_000_000_000
            ):
                raise ValueError(ERROR)
            self._resource_last_end = sample["read_end_ns"]
            self._resource_last_phase = phase
            return {**native, "container_cpu_read": {**sample, "phase": phase}}
        except Exception:
            self._resource_failed = True
            raise ValueError(ERROR) from None
