"""Opt-in integrated synthetic action screen; production-source dispatch remains rejected."""

import time
from dataclasses import asdict

from live_probe_control.contained_capture import GameCaptureContext
from live_probe_control.contracts import digest
from live_probe_control.controller import GRACE_NS
from live_probe_control.journal import CadenceJournal
from live_probe_control.probe_transport import EngineeringControl
from observer_native_screen import NativeScreen

METHOD = "n10-integrated-control-disturbance-v1"
PHASES = ("baseline", "during", "restored")
DURATION_NS = 5000000000


class ControlDisturbance:
    source = "isolated_synthetic"
    method = METHOD

    def __init__(self, service, scene, bridge, local, capability, emit):
        if service.source != self.source or type(service.control) is not EngineeringControl or not service.control.matches_source(self.source):
            raise ValueError(self.source + " engineering control required")
        self.service, self.scene, self.bridge = service, scene, bridge
        self.local, self.capability, self.emit = local, capability, emit
        self.origin = self.stage_start = time.monotonic_ns()
        self.stage, self.phase = "eligibility", "baseline"
        self.scopes, self.identities = {}, None
        self.operation = self.sampler = None
        self.dispatched_at = None

    def slots(self, peers=("first", "second")):
        slots = {peer: self.service.active.get(peer) for peer in peers}
        now = time.monotonic_ns()
        for slot in slots.values():
            if slot is None or slot.owner is None or slot.stop.is_set() or slot.done.is_set() or slot.failure:
                return None
            observation = slot.owner.last_observation
            if observation is None or not 0 <= now - observation[1] <= 1500000000:
                return None
            if observation[0]["connection_state"] != "connected":
                return None
        return slots

    @staticmethod
    def identity(slots):
        return {peer: digest({"token": slot.token, "offer": slot.sdp, "generation": asdict(slot.owner.generation)})
                for peer, slot in slots.items()}

    def ready(self, slots, *, continuity=False):
        for peer, slot in slots.items():
            record = self.bridge.records.get(peer)
            if record is None or not record.receiver_socket_id:
                return False
            if peer not in self.scopes:
                self.scopes[peer] = self.bridge.attach(self.local, self.capability, peer, slot.token)
        observations = [self.local.inspect(self.scopes[peer]) for peer in slots]
        return all(value["continuity_ready"] if continuity else value["status"] == "ready_for_dry_run"
                   for value in observations)

    def begin(self, slots):
        identity = self.identity(slots)
        if self.identities is None:
            self.identities = identity
        if identity != self.identities:
            raise ValueError("control screen worker/offer changed")
        self.sampler = NativeScreen(self.service, self.scene, control_phase=self.phase, record_phase=self.source == "isolated_game")
        self.stage = "measure"
        self.emit("control_window_started", phase=self.phase, method=self.method)

    def target_ready(self, slots, target):
        return all(slot.owner.last_observation[0]["configured_fps"] == (target if peer == "first" else 30)
                   and slot.owner.last_observation[0]["negotiated_fps"] == (target if peer == "first" else 30)
                   for peer, slot in slots.items())

    def tick(self):
        now = time.monotonic_ns()
        slots = self.slots()
        if slots is None:
            if self.stage != "eligibility" or now - self.origin > 8 * 10**9:
                raise ValueError("control screen native eligibility lost/deadline")
            return False
        if self.identities is not None and self.identity(slots) != self.identities:
            raise ValueError("control screen worker lifetime/offer changed")
        if self.stage == "eligibility":
            if now - self.origin > 8 * 10**9:
                raise ValueError("control screen eligibility deadline")
            if self.ready(slots) and self.target_ready(slots, 30):
                self.stage, self.stage_start = "warmup", now
        elif self.stage == "warmup":
            if not self.ready(slots) or not self.target_ready(slots, 30):
                raise ValueError("control screen readiness lost during fixed warmup")
            if now - self.stage_start >= 3 * 10**9:
                self.begin(slots)
        elif self.stage == "measure":
            if self.phase == "during" and self.operation.done.is_set():
                raise ValueError("action ended inside active measurement")
            if self.sampler.sample():
                self.emit("control_native", phase=self.phase, method=self.method,
                          worker_identities=self.identities, **self.sampler.report())
                if self.phase == "baseline":
                    draft = self.local.prepare(self.capability, self.scopes["first"], "disturbance-request", 24, DURATION_NS)
                    self.operation = self.local.dispatch(self.capability, draft)
                    if self.local.dispatch(self.capability, draft) is not self.operation:
                        raise ValueError("control screen duplicate dispatch")
                    self.dispatched_at = now
                    self.emit("control_dispatched", method=self.method, request=asdict(draft.request), live_authority=False)
                    self.stage, self.stage_start = "await-during", now
                elif self.phase == "during":
                    self.stage = "await-result"
                else:
                    self.stage = "done"
                    return True
        elif self.stage in ("await-during", "settle-during"):
            if self.operation.done.is_set() or now - self.dispatched_at > 2 * 10**9:
                raise ValueError("active target unavailable within settling bound")
            target = self.target_ready(slots, 24)
            if self.stage == "await-during" and target:
                self.stage, self.stage_start = "settle-during", now
            elif self.stage == "settle-during":
                if not target:
                    raise ValueError("active target lost during fixed settling")
                if now - self.stage_start >= 500000000:
                    self.phase = "during"
                    self.begin(slots)
        elif self.stage == "await-result":
            if now - self.dispatched_at > DURATION_NS + GRACE_NS + 10**9:
                raise ValueError("control result deadline")
            if self.operation.done.is_set():
                result = self.operation.result
                if result is None or result.outcome != "completed" or result.restoration != "verified_by_port" or result.live_authority:
                    raise ValueError("control completion/restoration unavailable")
                with CadenceJournal(self.local.directory) as store:
                    journal = store.journal
                if journal["state"] != "clean" or journal["actions"] != 1 or journal["reserved_ns"] != DURATION_NS + GRACE_NS:
                    raise ValueError("control ledger/budget mismatch")
                self.emit("control_result", method=self.method, result=asdict(result), ledger_state=journal["state"],
                          actions=journal["actions"], reserved_ns=journal["reserved_ns"])
                self.restoration_sequences = {peer: slot.owner.last_observation[2] for peer, slot in slots.items()}
                self.stage, self.stage_start = "await-restored", now
        elif self.stage == "await-restored":
            if now - self.stage_start > 1000000000:
                raise ValueError("fresh restored target unavailable within observation bound")
            if self.target_ready(slots, 30) and all(slot.owner.last_observation[2] > self.restoration_sequences[peer]
                                                   for peer, slot in slots.items()):
                self.stage, self.stage_start = "settle-restored", now
        elif self.stage == "settle-restored":
            if not self.target_ready(slots, 30):
                raise ValueError("restored target lost during fixed settling")
            if now - self.stage_start >= 500000000:
                self.phase = "restored"
                self.begin(slots)
        elif self.stage == "done":
            raise ValueError("control screen already complete")
        return False


class GameControlDisturbance(ControlDisturbance):
    source = "isolated_game"
    method = "n10-contained-game-control-disturbance-v1"

    def __init__(self, service, scene, bridge, local, capability, emit):
        super().__init__(service, scene, bridge, local, capability, emit)
        if service.control.capture != GameCaptureContext.from_scene(scene):
            raise ValueError("control capture does not match exact owned scene")
        emit("control_capture_bound", method=self.method, scope="owned_x99_game_display",
             binding_hash=digest(asdict(service.control.capture)), live_authority=False)
