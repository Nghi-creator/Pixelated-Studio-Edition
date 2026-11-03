"""One owned engineering 30/24/30 acquisition; no cause/label/production authority."""
import time
from dataclasses import asdict
from pathlib import Path

from control_disturbance import DURATION_NS, GameControlDisturbance
from research.live_probe_control.control.controller import GRACE_NS
from research.live_probe_control.control.journal import CadenceJournal

PHASES = ("degraded", "relief", "recovery")
TARGETS = dict(zip(PHASES, (30, 24, 30)))


class PairedObservation(GameControlDisturbance):
    method = "n11-contained-paired-observation-v1"

    def __init__(self, *args):
        super().__init__(*args)
        self.stage, self.phase = "eligibility", "degraded"
        self.marker_root = Path("/acceptance")
        self.native_sequence = None
        self.now = time.monotonic_ns

    def marker(self, kind):
        path = self.marker_root / ("n11-" + kind + "-" + self.phase + ".json")
        if not path.exists():
            return False
        if path.is_symlink() or path.stat().st_size != 17 or path.read_text() != '{"complete":true}':
            raise ValueError("invalid paired phase marker")
        return True

    def start_prime(self, now):
        self.stage, self.stage_start = "prime", now
        self.emit("n11_pair_target", phase=self.phase, target_fps=TARGETS[self.phase],
                  at_ns=now-self.origin, live_authority=False)

    def checkpoint(self):
        path = Path(self.local.directory) / "journal.json"
        if not path.exists():
            self.emit("n11_pair_journal", state="not_created", result=None)
            return
        with CadenceJournal(self.local.directory) as store:
            journal = store.journal
        self.emit("n11_pair_journal", **{k: journal[k] for k in (
            "state", "actions", "reserved_ns", "content_hash")},
            history=[{k: row[k] for k in ("request_hash", "result", "failure")} for row in journal["history"]],
            operation_done=bool(self.operation and self.operation.done.is_set()),
            result=asdict(self.operation.result) if self.operation and self.operation.result else None)

    def tick(self):
        now = self.now()
        slots = self.slots(("first",))
        if slots is None:
            if self.stage != "eligibility" or now-self.origin > 8*10**9:
                raise ValueError("paired native source unavailable")
            return False
        if len(self.service.active) != 1 or self.scene.game.poll() is not None:
            raise ValueError("paired source set changed")
        identity = self.identity(slots)
        if self.identities is not None and identity != self.identities:
            raise ValueError("paired worker/offer changed")
        if self.stage == "eligibility":
            if now-self.origin > 8*10**9:
                raise ValueError("paired eligibility deadline")
            if self.ready(slots) and self.target_ready(slots, 30):
                self.identities = identity
                self.start_prime(now)
            return False
        if self.phase == "relief":
            if self.stage != "result" and now-self.dispatched_at >= DURATION_NS:
                raise ValueError("five-second action boundary reached during relief collection")
            if self.operation.done.is_set():
                if self.stage != "result":
                    raise ValueError("action ended before whole relief collection completed")
            if self.stage in ("target", "prime", "settle") and now-self.dispatched_at > 1750000000:
                raise ValueError("paired relief start deadline")
        if self.stage == "target":
            if self.target_ready(slots, TARGETS[self.phase]) and (
                slots["first"].owner.last_observation[2] > self.target_sequence
            ):
                self.start_prime(now)
            elif now-self.stage_start > 1500000000:
                raise ValueError("fresh paired target deadline")
        elif self.stage in ("prime", "settle", "measure"):
            if not self.target_ready(slots, TARGETS[self.phase]):
                raise ValueError("paired native target changed")
            if self.stage == "prime":
                if now-self.stage_start > 2*10**9:
                    raise ValueError("paired parser prime deadline")
                if self.marker("prime"):
                    self.stage = "settle"
            elif self.stage == "settle" and now-self.stage_start >= 500000000:
                self.stage, self.stage_start = "measure", now
                self.native_sequence = None
                self.emit("n11_pair_phase_started", phase=self.phase, at_ns=now-self.origin,
                          action_elapsed_ns=now-self.dispatched_at if self.phase == "relief" else None,
                          worker_identities=self.identities, live_authority=False)
            elif self.stage == "measure":
                observation, _, sequence = slots["first"].owner.last_observation
                if sequence != self.native_sequence:
                    self.native_sequence = sequence
                    self.emit("n11_pair_native", phase=self.phase, at_ns=now-self.origin,
                              sequence=sequence, **{k: observation[k] for k in (
                                  "configured_fps", "negotiated_fps", "capture_buffers", "encoded_buffers")})
                if now-self.stage_start > 4500000000:
                    raise ValueError("whole paired collection deadline")
                if self.marker("phase"):
                    if now-self.stage_start < 3000000000:
                        raise ValueError("premature whole paired phase completion")
                    self.emit("n11_pair_phase_completed", phase=self.phase, at_ns=now-self.origin,
                              action_elapsed_ns=now-self.dispatched_at if self.phase == "relief" else None)
                    if self.phase == "degraded":
                        draft = self.local.prepare(self.capability, self.scopes["first"], "n11-paired-request", 24, DURATION_NS)
                        self.dispatched_at = self.now()
                        self.operation = self.local.dispatch(self.capability, draft)
                        self.target_sequence = slots["first"].owner.last_observation[2]
                        self.emit("n11_pair_dispatched", request=asdict(draft.request), at_ns=self.dispatched_at-self.origin,
                                  live_authority=False)
                        self.phase, self.stage, self.stage_start = "relief", "target", self.dispatched_at
                    elif self.phase == "relief":
                        self.stage = "result"
                    else:
                        self.stage = "done"
                        return True
        elif self.stage == "result":
            if now-self.dispatched_at > DURATION_NS+GRACE_NS+10**9:
                raise ValueError("paired result deadline")
            if self.operation.done.is_set():
                result = self.operation.result
                if result is None or result.outcome != "completed" or result.restoration != "verified_by_port" or result.live_authority:
                    raise ValueError("paired restoration unverified")
                with CadenceJournal(self.local.directory) as store:
                    journal = store.journal
                if journal["state"] != "clean" or journal["actions"] != 1 or journal["reserved_ns"] != DURATION_NS+GRACE_NS:
                    raise ValueError("paired journal/budget mismatch")
                self.emit("n11_pair_result", result=asdict(result), ledger_state=journal["state"],
                          actions=journal["actions"], reserved_ns=journal["reserved_ns"], at_ns=now-self.origin)
                self.phase, self.stage, self.stage_start = "recovery", "target", now
                self.target_sequence = slots["first"].owner.last_observation[2]
        elif self.stage == "done":
            raise ValueError("paired acquisition already complete")
        return False
