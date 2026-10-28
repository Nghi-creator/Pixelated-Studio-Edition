"""Separate fixed-schedule owned-game acquisition; unchanged means no control request."""

import os
import time
from dataclasses import asdict

from control_disturbance import GameControlDisturbance
from observer_moving_gate import MovingObserverGate
from observer_native_screen import NativeScreen

from live_probe_control.journal import CadenceJournal

from live_probe_control.action_cost_protocol import (
    METHOD,
    SCHEDULE,
    LATE_NS,
    UNMEASURED_COST_SCOPES,
    versioned_protocol,
)


class ActionCostGate(MovingObserverGate):
    method = METHOD


class GameActionCost(GameControlDisturbance):
    method = METHOD
    schedule = SCHEDULE

    def __init__(
        self,
        service,
        scene,
        bridge,
        local,
        capability,
        emit,
        *,
        condition,
        version="v1",
    ):
        if condition not in ("unchanged", "action"):
            raise ValueError("closed action-cost condition required")
        self.method, self.schedule, _ = versioned_protocol(version)
        super().__init__(service, scene, bridge, local, capability, emit)
        self.condition = condition
        self.gate = ActionCostGate(scene, emit)
        self.gate.method = self.method
        self.gate.origin = self.origin
        self.edges, self.completed_phases = [], []
        self.boundary = self.target_since = self.restored_since = None
        self.result_seen = False
        self.restoration_sequences = None
        self.last_age = -1

    def no_journal(self, *, required=True):
        present = os.path.lexists(os.path.join(self.local.directory, "journal.json"))
        if required and present:
            raise ValueError("unchanged/baseline created action intent")

    def edge(self, label, planned):
        self.edges.append(
            {
                "label": label,
                "planned_script_age_ns": planned,
                "at_ns": time.monotonic_ns() - self.origin,
                **self.scene.phase(),
            }
        )

    def begin_window(self, phase, age):
        if not 0 <= age - self.schedule[phase] <= LATE_NS:
            raise ValueError("action-cost fixed window missed")
        self.phase = phase
        self.sampler = NativeScreen(
            self.service,
            self.scene,
            record_phase=True,
            control_phase=phase,
            during_fps=24 if self.condition == "action" else 30,
        )
        self.edge(phase + "_start", self.schedule[phase])
        self.emit("control_window_started", phase=phase, method=self.method)

    def apply_boundary(self, slots, now, age):
        if not 0 <= age - self.schedule["boundary"] <= LATE_NS:
            raise ValueError("action-cost fixed boundary missed")
        self.no_journal()
        self.boundary = now
        self.boundary_sequences = {
            peer: slot.owner.last_observation[2] for peer, slot in slots.items()
        }
        self.edge("boundary", self.schedule["boundary"])
        request = None
        if self.condition == "action":
            draft = self.local.prepare(
                self.capability,
                self.scopes["first"],
                "action-cost-request",
                24,
                5000000000,
            )
            self.operation = self.local.dispatch(self.capability, draft)
            if self.local.dispatch(self.capability, draft) is not self.operation:
                raise ValueError("action-cost duplicate dispatch")
            request = asdict(draft.request)
        self.emit(
            "action_cost_boundary",
            method=self.method,
            condition=self.condition,
            request=request,
            native_sequences=self.boundary_sequences,
            live_authority=False,
        )

    def observe_result(self, slots):
        if (
            self.condition != "action"
            or self.result_seen
            or not self.operation.done.is_set()
        ):
            return
        result = self.operation.result
        if (
            result is None
            or (result.outcome, result.reason, result.restoration)
            != ("completed", "duration_elapsed", "verified_by_port")
            or result.live_authority is not False
        ):
            raise ValueError("action-cost action/restoration unavailable")
        if time.monotonic_ns() - self.boundary < 5000000000:
            raise ValueError("action-cost completed before fixed action duration")
        journal = self.completed_journal()
        self.emit(
            "action_cost_result",
            method=self.method,
            result=asdict(result),
            ledger_state=journal["state"],
            actions=journal["actions"],
            reserved_ns=journal["reserved_ns"],
            at_ns=time.monotonic_ns() - self.origin,
            **self.scene.phase(),
            live_authority=False,
        )
        self.result_seen = True
        self.restoration_sequences = {
            peer: slot.owner.last_observation[2] for peer, slot in slots.items()
        }

    def completed_journal(self):
        with CadenceJournal(self.local.directory) as store:
            self.service.control.check(store)
            journal = store.journal
        if (
            journal is None
            or journal["state"] != "clean"
            or journal["actions"] != 1
            or journal["reserved_ns"] != 7000000000
        ):
            raise ValueError("action-cost retained budget mismatch")
        return journal

    def tick(self):
        now = time.monotonic_ns()
        slots = self.slots()
        if self.stage == "eligibility":
            ready = (
                slots is not None and self.ready(slots) and self.target_ready(slots, 30)
            )
            if not self.gate.tick(ready):
                return False
            self.identities = self.identity(slots)
            self.stage = "scheduled"
            self.no_journal()
        if slots is None or self.identity(slots) != self.identities:
            raise ValueError("action-cost worker/offer eligibility lost")
        age = self.scene.phase()["script_age_ns"]
        if type(age) is not int or age < self.last_age:
            raise ValueError("action-cost script clock reversed")
        self.last_age = age
        if self.stage == "done":
            raise ValueError("action-cost acquisition already complete")
        if self.boundary is not None:
            self.observe_result(slots)
        if not self.ready(slots, continuity=self.result_seen):
            raise ValueError("action-cost receiver readiness lost")
        self.no_journal(required=self.condition == "unchanged" or self.boundary is None)
        if self.condition == "unchanged" or self.boundary is None:
            if not self.target_ready(slots, 30):
                raise ValueError("unchanged/baseline readiness lost")
        if self.sampler is None and not self.completed_phases:
            self.begin_window("baseline", age)
        if self.boundary is None and age >= self.schedule["boundary"]:
            if self.completed_phases != ["baseline"]:
                raise ValueError("baseline crossed fixed action boundary")
            self.apply_boundary(slots, now, age)
        if self.boundary is not None:
            self.observe_result(slots)
            if not self.result_seen and now - self.boundary < 5000000000:
                target = 24 if self.condition == "action" else 30
                if self.target_ready(slots, target):
                    if self.target_since is None:
                        sequences = {
                            peer: slot.owner.last_observation[2]
                            for peer, slot in slots.items()
                        }
                        if self.condition == "unchanged" or all(
                            sequences[p] > self.boundary_sequences[p] for p in sequences
                        ):
                            self.target_since = time.monotonic_ns()
                            self.emit(
                                "action_cost_target_observed",
                                method=self.method,
                                condition=self.condition,
                                at_ns=self.target_since - self.origin,
                                **self.scene.phase(),
                                native_sequences=sequences,
                                target_fps=target,
                                live_authority=False,
                            )
                elif self.target_since is not None:
                    raise ValueError("action-cost target lost before fixed window")
            if self.condition == "action" and self.result_seen:
                newer = all(
                    slot.owner.last_observation[2] > self.restoration_sequences[peer]
                    for peer, slot in slots.items()
                )
                if newer and self.target_ready(slots, 30):
                    if self.restored_since is None:
                        self.restored_since = time.monotonic_ns()
                        self.emit(
                            "action_cost_restore_observed",
                            method=self.method,
                            at_ns=self.restored_since - self.origin,
                            **self.scene.phase(),
                            native_sequences={
                                p: s.owner.last_observation[2] for p, s in slots.items()
                            },
                            after_result_sequences=self.restoration_sequences,
                            live_authority=False,
                        )
                elif self.restored_since is not None:
                    raise ValueError("action-cost restored target lost")
        if (
            self.sampler is None
            and self.completed_phases == ["baseline"]
            and age >= self.schedule["during"]
        ):
            if self.target_since is None or now - self.target_since < 500000000:
                raise ValueError("target was not stable before fixed during window")
            self.begin_window("during", age)
        if (
            self.sampler is None
            and self.completed_phases == ["baseline", "during"]
            and age >= self.schedule["restored"]
        ):
            if self.condition == "action" and (
                not self.result_seen
                or not self.ready(slots)
                or self.restored_since is None
                or now - self.restored_since < 500000000
            ):
                raise ValueError("restoration not stable before fixed restored window")
            self.begin_window("restored", age)
        if self.sampler is not None:
            if (
                self.phase == "during"
                and self.condition == "action"
                and self.operation.done.is_set()
            ):
                raise ValueError("action ended inside fixed during window")
            if self.sampler.sample():
                self.emit(
                    "control_native",
                    method=self.method,
                    phase=self.phase,
                    worker_identities=self.identities,
                    **self.sampler.report(),
                )
                self.edge(self.phase + "_end", self.schedule[self.phase] + 2500000000)
                self.completed_phases.append(self.phase)
                self.sampler = None
                if self.phase == "restored":
                    if self.condition == "unchanged":
                        self.no_journal()
                    else:
                        self.completed_journal()
                    self.emit(
                        "action_cost_schedule",
                        method=self.method,
                        condition=self.condition,
                        schedule=self.schedule,
                        edges=self.edges,
                        eligibility=self.gate.phases,
                        journal_state="absent"
                        if self.condition == "unchanged"
                        else "clean",
                        actions=0 if self.condition == "unchanged" else 1,
                        reserved_ns=0 if self.condition == "unchanged" else 7000000000,
                        source_content_matched=False,
                        unmeasured_cost_scopes=list(UNMEASURED_COST_SCOPES),
                        live_authority=False,
                    )
                    self.stage = "done"
                    return True
        return False
