"""Opt-in condition observer extension; no launcher mode or collection authority."""

import hashlib
import json
from dataclasses import asdict

from condition_observation import ConditionObservation

from research.live_probe_control.peers.peer_protocol import encoded_read_value

from .cgroup_cpu import CgroupCpuSampler

METHOD = "n11-contained-condition-resource-candidate-v1"
ERROR = "invalid_contained_resource_observation"
PREPARATION_METHOD = "n11-resource-reference-preparation-candidate-v1"
MAX_PREPARATION_NS = 1_000_000_000
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
        self._cadence_diagnostic_emitted = False
        self._operation_checkpoint_emitted = False
        self._resource_last_end = self._resource_last_phase = None
        self._resource_upstream_emit = self.emit
        self.emit = self._resource_emit

    def checkpoint(self):
        operation = getattr(self, "operation", None)
        checkpoint = getattr(operation, "checkpoint", None)
        if callable(checkpoint) and not getattr(self, "_operation_checkpoint_emitted", False):
            self.emit(
                "n11_cadence_operation_checkpoint", operation=checkpoint(),
                scope="passive_operation_status_not_admission_or_restoration_proof",
                live_authority=False,
            )
            self._operation_checkpoint_emitted = True
        diagnostic = getattr(getattr(self, "operation", None), "diagnostic", None)
        if diagnostic is not None and not getattr(self, "_cadence_diagnostic_emitted", False):
            self.emit(
                "n11_cadence_failure_diagnostic", diagnostic=diagnostic,
                scope="passive_first_failure_not_causal_proof_or_control_authority",
                live_authority=False,
            )
            self._cadence_diagnostic_emitted = True
        return super().checkpoint()

    def reference(self, now):
        try:
            if self._resource_failed:
                raise ValueError(ERROR)
            if self.pacing_stage == "healthy" and self._resource_sampler is None:
                self._prepare_reference()
                # Preparation never contributes a measurement. The next normal
                # tick supplies its own honest timestamp and rechecks readiness.
                return False
            return super().reference(now)
        except _ReferencePending:
            # The base emits before clearing its row buffer or advancing stage.
            return False

    def _ensure_resource_sampler(self, slot):
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
            self._resource_clock_id = clock_id
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

    def _prepare_reference(self):
        try:
            start = self.now()
            slots = self.slots(("first",))
            if self.scene.game.poll() is not None:
                raise ValueError(ERROR)
            if slots is None or not self.target_ready(slots, 30) or not self.ready(slots):
                if not 0 <= self.now() - start <= MAX_PREPARATION_NS:
                    raise ValueError(ERROR)
                return
            identity = self.identity(slots)
            if self.identities is not None and identity != self.identities:
                raise ValueError(ERROR)
            self.identities = identity
            self._ensure_resource_sampler(slots["first"])
            end = self.now()
            if not 0 <= end - start <= MAX_PREPARATION_NS:
                raise ValueError(ERROR)
            self.emit(
                "n11_observer_prepared",
                method=PREPARATION_METHOD,
                read_start_ns=start - self.origin,
                read_end_ns=end - self.origin,
                clock_id=self._resource_clock_id,
                measurement_samples_taken=0,
                scope="startup_eligibility_context_and_sampler_setup_before_reference_measurement",
                live_authority=False,
            )
            if not 0 <= self.now() - start <= MAX_PREPARATION_NS:
                raise ValueError(ERROR)
        except Exception:
            self._resource_failed = True
            raise ValueError(ERROR) from None

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
            if "encoded_counter_read" in observation:
                encoded = encoded_read_value(
                    observation["encoded_counter_read"],
                    outer_start=observation["read_start_ns"],
                    outer_end=observation["read_end_ns"],
                    counter=observation["encoded_buffers"],
                )
                if encoded is not None:
                    native["encoded_counter_read"] = dict(
                        **encoded, clock_id=native["native_read"]["clock_id"],
                        basis="worker_elapsed_monotonic_ns",
                        scope="reported_encoded_counter_only_not_other_snapshot_fields",
                        underlying_counter_freshness="not_authenticated_by_read_brackets",
                        live_authority=False,
                    )
            if self.pacing_stage in ("healthy", "post"):
                phase = self.pacing_stage
            elif self.pacing_stage == "pair" and self.stage == "measure":
                phase = self.phase
            else:
                raise ValueError(ERROR)
            if phase not in PHASES:
                raise ValueError(ERROR)
            self._ensure_resource_sampler(slot)
            clock_id = self._resource_clock_id
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
