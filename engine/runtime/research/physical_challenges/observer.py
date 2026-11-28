"""Separate controller-side phase observer; no acquisition launcher or N2 pair export."""

import hashlib
from dataclasses import asdict

from scripts.research.n11.native.pacing_observation import PacingContrastObservation
from scripts.research.n11.native.paired_observation import PairedObservation

from research.live_probe_control.peers.peer_protocol import encoded_read_value
from research.resource_observation.cgroup_cpu import CgroupCpuSampler
from research.resource_observation.contained_condition import ResourceConditionObservation

from .handle import ChallengeHandle
from .lifecycle import RECIPES
from .peer import encode

METHOD = "n11-physical-challenge-observation-v1"


class _DispatchBoundary:
    def __init__(self, local, observer):
        self.local, self.observer = local, observer

    def __getattr__(self, name):
        return getattr(self.local, name)

    def dispatch(self, *args, **kwargs):
        self.observer._send("dispatch_relief")
        return self.local.dispatch(*args, **kwargs)


class ChallengeObservation(PairedObservation):
    method = METHOD
    minimum_phase_ns = 3_200_000_000

    def __init__(
        self, *args, recipe, handle_factory=ChallengeHandle, sampler_factory=CgroupCpuSampler
    ):
        if type(recipe) is not str or recipe not in RECIPES:
            raise ValueError("closed challenge recipe required")
        super().__init__(*args)
        self.recipe, self.handle_factory, self.sampler_factory = (
            recipe,
            handle_factory,
            sampler_factory,
        )
        self.local = _DispatchBoundary(self.local, self)
        self.challenge_stage, self.pacer = "healthy", None
        self.reference_rows, self.reference_sequence = [], None
        self.resource_sampler, self.resource_context = None, None
        self.cleanup_emitted = False
        self.handle_released = False
        self._encoded_event_trace = True  # All challenge launch modes require event tracing.

    def _send(self, operation):
        start = self.now() - self.origin
        ack = self.pacer.send(operation)
        self.emit(
            "n11_challenge_command",
            operation=operation,
            read_start_ns=start,
            read_end_ns=self.now() - self.origin,
            ack=ack,
            live_authority=False,
        )
        return ack

    def native_read_evidence(self, slot, observation):
        native = PacingContrastObservation.native_read_evidence(self, slot, observation)
        phase = self.challenge_stage
        if phase == "pair" and self.stage == "measure":
            phase = self.phase
        if phase not in ("healthy", "degraded", "relief", "recovery", "post"):
            raise ValueError("challenge read outside measurement phase")
        encoded = encoded_read_value(
            observation.get("encoded_counter_read"),
            outer_start=observation["read_start_ns"],
            outer_end=observation["read_end_ns"],
            counter=observation.get("encoded_buffers"),
        )
        if encoded is None:
            raise ValueError("challenge encoded counter read unavailable")
        native["encoded_counter_read"] = dict(
            **encoded,
            clock_id=native["native_read"]["clock_id"],
            basis="worker_elapsed_monotonic_ns",
            scope="reported_encoded_counter_only_not_other_snapshot_fields",
            underlying_counter_freshness="not_authenticated_by_read_brackets",
            live_authority=False,
        )
        context = dict(
            method=METHOD,
            generation=asdict(slot.owner.generation),
            controller_origin_ns=str(self.origin),
        )
        if self.resource_sampler is None:
            clock_id = "controller-monotonic-" + hashlib.sha256(encode(context)).hexdigest()
            self.resource_context = context
            self.resource_sampler = self.sampler_factory(
                clock_id=clock_id,
                expected_quota_us=200000,
                expected_period_us=100000,
                clock=lambda: self.now() - self.origin,
            )
            self.emit(
                "n11_challenge_resource_context",
                context=context,
                clock_id=clock_id,
                live_authority=False,
            )
        if context != self.resource_context:
            raise ValueError("challenge resource generation changed")
        return {**native, "container_cpu_read": {**self.resource_sampler.sample(), "phase": phase}}

    def reference(self, now):
        slots = self.slots(("first",))
        if self.scene.game.poll() is not None or len(self.service.active) != 1:
            raise ValueError("challenge source set changed")
        if (
            slots is None
            or not self.target_ready(slots, 30)
            or not self.ready(slots, continuity=self.challenge_stage == "post")
        ):
            return False
        identity = self.identity(slots)
        if self.identities is None:
            self.identities = identity
        if identity != self.identities:
            raise ValueError("challenge source identity changed")
        slot = slots["first"]
        if self.pacer is None:
            self.pacer = self.handle_factory(self.local, slot, self.recipe)
        body, _, sequence = slot.owner.last_observation
        if sequence == self.reference_sequence:
            return False
        self.reference_sequence = sequence
        state = self.pacer.sample(fresh=True)
        if (
            state["witness"] is None
            or state["witness"]["delay_us"] != 0
            or state["witness"]["pressure"]["active_workers"]
        ):
            raise ValueError("challenge reference not free of owned conditions")
        self.reference_rows.append(
            dict(
                at_ns=self.now() - self.origin,
                sequence=sequence,
                **{
                    k: body[k]
                    for k in (
                        "configured_fps",
                        "negotiated_fps",
                        "capture_buffers",
                        "encoded_buffers",
                    )
                },
                **self.native_read_evidence(slot, body),
                condition_state=state,
            )
        )
        if self.reference_rows[-1]["at_ns"] - self.reference_rows[0]["at_ns"] < 3_200_000_000:
            return False
        if not ResourceConditionObservation._reference_read_spans_ready(self, self.reference_rows):
            return False
        self.emit(
            "n11_challenge_reference",
            phase=self.challenge_stage,
            samples=self.reference_rows,
            worker_identities=self.identities,
            live_authority=False,
        )
        self.reference_rows = []
        return True

    def phase_boundary(self, kind, phase):
        if kind not in ("before_start", "after_end"):
            raise ValueError("closed challenge boundary required")
        self._send(("begin_" if kind == "before_start" else "end_") + phase)
        if kind == "after_end" and phase == "degraded":
            self._send("prepare_relief")
            self.pacer.wait_established()  # Complete before the real cadence action exists.

    def stop_challenge(self):
        if self.handle_released:
            return  # Worker/media teardown retains the independent safety cleanup.
        if self.pacer is not None and not self.cleanup_emitted:
            self._send("close")
            self.cleanup_emitted = True

    def checkpoint(self):
        try:
            self.stop_challenge()
        finally:
            if self.pacer is not None:
                self.emit(
                    "n11_challenge_command_transcript",
                    transcript=self.pacer.transcript,
                    live_authority=False,
                )
            try:
                super().checkpoint()
            finally:
                if self.pacer is not None:
                    self.handle_released = True
                    self.pacer.release()

    def tick(self):
        now = self.now()
        if self.challenge_stage in ("healthy", "post"):
            if self.challenge_stage == "healthy" and now - self.origin > 8_000_000_000:
                raise ValueError("challenge healthy reference deadline")
            if not self.reference(now):
                return False
            if self.challenge_stage == "post":
                self.challenge_stage = "done"
                return True
            self._send("start")
            self.challenge_stage = "establish"
            return False
        if self.challenge_stage == "done":
            raise ValueError("challenge acquisition already complete")
        self.pacer.alive()
        if self.challenge_stage == "establish":
            state = self.pacer.sample(fresh=True)
            if state["observed_ns"] < state["ready_not_before_ns"]:
                return False
            self.challenge_stage = "pair"
        complete = super().tick()
        if complete:
            self.stop_challenge()
            self.challenge_stage = "post"
            self.reference_sequence = self.service.active["first"].owner.last_observation[2]
        return False
