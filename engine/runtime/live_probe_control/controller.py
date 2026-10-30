"""Default-disabled, synchronous cadence lifecycle outside all media callbacks."""

import copy
import threading
import time
from dataclasses import asdict

from .contracts import Generation, Policy, Request, Result, Snapshot, digest, integer
from .journal import CadenceJournal
from .watchdog import PidfdWatchdog, process_gone, process_identity

GRACE_NS = 2000000000


class CadenceController:
    """Port must own a dedicated worker and provide independent restore proof.

    Required port methods: snapshot(), set_fps(int), verify_restored(prior,
    deadline_ns). There is intentionally no normal-camera or network binding.
    """

    def __init__(
        self,
        directory,
        policy,
        port,
        *,
        enabled=False,
        watchdog_factory=PidfdWatchdog,
        clock=time.monotonic_ns,
        sleep=time.sleep,
        identity=process_identity,
        gone=process_gone,
    ):
        if type(enabled) is not bool or type(policy) is not Policy:
            raise ValueError("explicit policy/opt-in required")
        self.enabled = enabled
        self.policy = policy
        self.port = port
        self.store = CadenceJournal(directory)
        self.watchdog_factory = watchdog_factory
        self.clock, self.sleep, self.identity, self.gone = clock, sleep, identity, gone
        self.guard = None
        self.busy = False
        self.last_clock = None
        self.operation_lock = threading.Lock()

    def _now(self):
        value = integer(self.clock(), 0, 2**63 - 1)
        if self.last_clock is not None and value < self.last_clock:
            raise ValueError("controller clock regressed")
        self.last_clock = value
        return value

    def __enter__(self):
        self.store.__enter__()
        return self

    def __exit__(self, *args):
        # Do not cancel a live watchdog merely because the owning control path
        # failed. EOF/deadline will terminate its exact dedicated worker.
        self.store.__exit__(*args)

    def _check(self):
        if (
            not self.enabled
            or getattr(self.port, "dedicated_process", False) is not True
            or self.store.fd is None
        ):
            raise ValueError("cadence control disabled or not a dedicated owned worker")
        if self.busy:
            raise ValueError("cadence control already active")

    def _snapshot(self):
        value = self.port.snapshot()
        if type(value) is not Snapshot:
            raise ValueError("typed cadence snapshot required")
        return Snapshot(**asdict(value) | {"generation": Generation(**asdict(value.generation))})

    def execute(self, request, *, cancelled=lambda: False):
        if not self.operation_lock.acquire(blocking=False):
            raise ValueError("cadence control already active")
        try:
            self._check()
            if type(request) is not Request:
                raise ValueError("typed cadence request required")
            request = Request(
                **asdict(request) | {"generation": Generation(**asdict(request.generation))}
            )
            self.busy = True
            try:
                return self._execute(request, cancelled)
            finally:
                self.busy = False
        finally:
            self.operation_lock.release()

    def _execute(self, request, cancelled):
        now = self._now()
        process = self.identity()
        policy_hash = digest(asdict(self.policy))
        ledger = (
            copy.deepcopy(self.store.journal)
            if self.store.journal is not None
            else dict(
                version="n10-cadence-journal-v1",
                policy_hash=policy_hash,
                state="clean",
                actions=0,
                reserved_ns=0,
                cooldown_until_ns=0,
                clock_boot=process["boot"],
                active=None,
                history=[],
            )
        )
        if ledger["policy_hash"] != policy_hash:
            raise ValueError("persistent policy mismatch")
        for row in ledger["history"]:
            if row["request"]["request_id"] == request.request_id:
                if row["request_hash"] != digest(asdict(request)):
                    raise ValueError("idempotency request conflict")
                if row["result"] is None:
                    if row["failure"] is not None:
                        return Result(**row["failure"])
                    raise ValueError("unresolved request requires teardown recovery")
                return Result(**row["result"])
        if ledger["state"] != "clean" or self.guard is not None:
            raise ValueError("dirty cadence journal blocks new actions")
        if ledger["clock_boot"] != process["boot"]:
            ledger.update(
                clock_boot=process["boot"], cooldown_until_ns=now + self.policy.cooldown_ns
            )
            self.store.save(ledger)
        reserve = request.duration_ns + GRACE_NS
        if (
            now < ledger["cooldown_until_ns"]
            or ledger["actions"] >= self.policy.maximum_actions
            or ledger["reserved_ns"] + reserve > self.policy.cumulative_duration_ns
            or not self.policy.settling_ns < request.duration_ns <= self.policy.maximum_duration_ns
        ):
            raise ValueError("cadence deadline/cooldown/budget unavailable")
        prior = self._snapshot()
        if (
            not prior.healthy
            or prior.generation != request.generation
            or prior.configured_fps != prior.negotiated_fps
            or not self.policy.minimum_fps
            <= request.target_fps
            < prior.configured_fps
            <= self.policy.maximum_fps
            or 100 * (prior.configured_fps - request.target_fps)
            > self.policy.maximum_reduction_percent * prior.configured_fps
            or cancelled() is not False
        ):
            raise ValueError("cadence preconditions unavailable")
        row = dict(
            request=asdict(request),
            request_hash=digest(asdict(request)),
            prior=asdict(prior),
            process=process,
            reserved_ns=reserve,
            result=None,
            failure=None,
        )
        ledger["history"].append(row)
        ledger.update(
            state="active",
            active=request.request_id,
            actions=ledger["actions"] + 1,
            reserved_ns=ledger["reserved_ns"] + reserve,
        )
        self.store.save(ledger)  # Durable intent/reservation precedes any setter.
        self.guard = self.watchdog_factory()
        reason = "apply_failed"
        armed = False
        applied_observed = False
        hard_deadline = None
        try:
            self.guard.arm(reserve)
            armed = True
            started = self._now()
            hard_deadline = started + reserve
            # Arm first, then recheck identities/health immediately before mutation.
            if self._snapshot() != prior:
                raise ValueError("cadence preimage changed")
            if cancelled() is not False:
                reason = "cancelled"
                raise ValueError("cancelled before setter")
            self.port.set_fps(request.target_fps)
            reason = "duration_elapsed"
            while self._now() < started + request.duration_ns:
                if cancelled() is not False:
                    reason = "cancelled"
                    break
                current = self._snapshot()
                if current.generation != prior.generation:
                    reason = "generation_changed"
                    break
                if (
                    not current.healthy
                    or current.settings_hash != prior.settings_hash
                    or current.configured_fps != request.target_fps
                    or current.negotiated_fps not in (prior.configured_fps, request.target_fps)
                    or (
                        self._now() >= started + self.policy.settling_ns
                        and current.negotiated_fps != request.target_fps
                    )
                ):
                    reason = "health_abort"
                    break
                applied_observed = applied_observed or current.negotiated_fps == request.target_fps
                self.sleep(0.05)
            if reason == "duration_elapsed" and not applied_observed:
                reason = "apply_failed"
        except (Exception, KeyboardInterrupt):
            reason = reason if reason in ("apply_failed", "cancelled") else "health_abort"
        restored = False
        try:
            if not armed:
                raise ValueError("watchdog unavailable; no cleanup mutation permitted")
            current = self._snapshot()
            if current.generation != prior.generation:
                reason = "generation_changed"
            elif current.configured_fps in (prior.configured_fps, request.target_fps):
                if current.configured_fps != prior.configured_fps:
                    self.port.set_fps(prior.configured_fps)
                restored = (
                    self.port.verify_restored(prior, min(hard_deadline, self._now() + GRACE_NS))
                    is True
                )
                check = self._snapshot()
                restored = restored and check == prior and self._now() <= hard_deadline
        except (Exception, KeyboardInterrupt):
            restored = False
        result = Result(
            request.request_id,
            "completed" if reason == "duration_elapsed" and restored else "aborted",
            "verified_by_port" if restored else "unknown",
            reason
            if restored
            or reason in ("generation_changed", "health_abort", "apply_failed", "cancelled")
            else "restore_failed",
        )
        if not restored:
            ledger["state"] = "dirty"
            row["failure"] = asdict(result)
            self.store.save(ledger)
            # No disarm: timeout tears down only the dedicated worker. Dirty
            # intent is resolved after proven teardown, never erased/refunded.
            return result
        # Two-phase completion: persist verified restoration while intent still
        # blocks requests, obtain watchdog acknowledgement, THEN commit clean.
        # A failed disarm can never leave a clean journal for a new controller.
        ledger["state"] = "restored_pending_watchdog"
        self.store.save(ledger)
        self.guard.disarm()
        row["result"] = asdict(result)
        ledger.update(
            state="clean", active=None, cooldown_until_ns=self._now() + self.policy.cooldown_ns
        )
        self.store.save(ledger)
        self.guard = None
        return result

    def recover_after_teardown(self):
        if not self.operation_lock.acquire(blocking=False):
            raise ValueError("cadence control already active")
        try:
            return self._recover_after_teardown()
        finally:
            self.operation_lock.release()

    def _recover_after_teardown(self):
        self._check()
        ledger = copy.deepcopy(self.store.journal)
        if ledger is None or ledger["state"] == "clean":
            return False
        if ledger["policy_hash"] != digest(asdict(self.policy)):
            raise ValueError("persistent recovery policy mismatch")
        row = next(value for value in ledger["history"] if value["result"] is None)
        if self.gone(row["process"]) is not True:
            raise ValueError("old worker lifetime not proven terminated")
        result = Result(
            row["request"]["request_id"],
            "interrupted_teardown",
            "not_verified_teardown",
            "worker_terminated",
        )
        row["result"] = asdict(result)
        ledger.update(
            state="clean",
            active=None,
            clock_boot=self.identity()["boot"],
            cooldown_until_ns=self._now() + self.policy.cooldown_ns,
        )
        self.store.save(ledger)
        return True
