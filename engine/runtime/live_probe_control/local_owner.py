"""Process-local admission and explicit contained engineering dispatch; no live authority."""

import copy
import os
import time
from dataclasses import asdict
from pathlib import Path

from .contracts import SECOND, Generation, Policy, Request, digest, integer
from .journal import CadenceJournal
from .local_binding import (
    BROWSER_FRESH_NS,
    DRAFT_FRESH_NS,
    NATIVE_FRESH_NS,
    Binding,
    RequestDraft,
)
from .local_binding import (
    ReceiverSample as ReceiverSample,
)
from .probe_transport import EngineeringControl, ProbeOperation


class OwnerCapability:
    """Identity checked by its issuer; never represented by caller JSON/aliases."""

    __slots__ = ()


class ReceiverCapability:
    """Allows declared observations only; cannot prepare local requests."""

    __slots__ = ()


class LocalProbeOwner:
    """Trusted host-process API; admission is not execution or qualification.

    The host supplies one existing private ledger directory for the owner/session.
    Peer IDs, browser claims, replacements and request IDs never select a path.
    Bindings/drafts are ephemeral; only CadenceController may reserve action budget.
    """

    def __init__(
        self, service, directory, policy, *, enabled=False, clock=time.monotonic_ns
    ):
        if type(enabled) is not bool or type(policy) is not Policy:
            raise ValueError("explicit local owner opt-in/policy required")
        path = Path(directory)
        if not path.is_absolute():
            raise ValueError("absolute host-owned ledger directory required")
        self.directory, self.policy = str(path), policy
        self.policy_hash = digest(asdict(policy))
        self.service, self.enabled, self.clock = service, enabled, clock
        self.capability = OwnerCapability()
        self.bindings, self.drafts, self.operations = {}, {}, {}
        self.active = self.closed = False
        self.last_clock = None
        self.directory_identity = None

    def _now(self):
        now = integer(self.clock(), 0, 2**63 - 1)
        if self.last_clock is not None and now < self.last_clock:
            self.close()
            raise ValueError("local owner clock regressed")
        self.last_clock = now
        return now

    def _ledger(self):
        with CadenceJournal(self.directory) as store:
            info = os.fstat(store.directory_fd)
            identity = (info.st_dev, info.st_ino)
            if (
                self.directory_identity is not None
                and identity != self.directory_identity
            ):
                raise ValueError("owner/session ledger directory replaced")
            self.directory_identity = identity
            ledger = store.journal
            if ledger is not None and ledger["policy_hash"] != digest(
                asdict(self.policy)
            ):
                raise ValueError("owner/session policy mismatch")
            return copy.deepcopy(ledger)

    def _request_ledger(self, request):
        ledger = self._ledger()
        if ledger is not None:
            if ledger["state"] != "clean":
                raise ValueError(
                    "dirty owner/session ledger requires teardown recovery"
                )
            for row in ledger["history"]:
                if row["request"]["request_id"] == request.request_id and row[
                    "request_hash"
                ] != digest(asdict(request)):
                    raise ValueError("durable request identity conflict")

    def __enter__(self):
        if not self.enabled or self.active or self.closed:
            raise ValueError("local probe admission disabled or already owned")
        self._ledger()  # Existing no-follow/owner/mode/lock rules, not a new journal format.
        self.active = True
        return self

    def __exit__(self, *_):
        self.close()

    def close(self):
        self.active = False
        self.closed = True
        for _draft, operation in self.operations.values():
            operation.cancelled.set()
        self.bindings.clear()
        self.drafts.clear()

    def claim(self):
        self._check()
        return self.capability

    def _check(self, capability=None):
        if not self.active or self.closed or not self.enabled:
            raise ValueError("local owner scope unavailable")
        if (
            type(self.policy) is not Policy
            or digest(asdict(self.policy)) != self.policy_hash
        ):
            raise ValueError("local owner policy changed")
        if capability is not None and capability is not self.capability:
            raise ValueError("foreign local owner capability")

    def _current(self, binding, now):
        slot = binding.slot
        return (
            not binding.invalid
            and not self.service.closed
            and self.service.active.get(binding.peer_id) is slot
            and slot.token == binding.token
            and not slot.stop.is_set()
            and not slot.done.is_set()
            and slot.failure is None
            and slot.owner.generation == binding.generation
            and slot.owner.state == "playing"
            and 0 <= now - slot.seen_ns <= 3 * SECOND
            and digest({"sdp": slot.sdp}) == binding.offer_hash
        )

    def bind(self, capability, peer_id, token):
        self._check(capability)
        if capability is not self.capability:
            raise ValueError("local owner capability required")
        now = self._now()
        for handle, binding in list(self.bindings.items()):
            if not self._current(binding, now):
                del self.bindings[handle]
        slot = self.service.active.get(peer_id)
        if (
            slot is None
            or slot.token != token
            or slot.owner is None
            or type(slot.owner.generation) is not Generation
        ):
            raise ValueError("exact dedicated peer generation unavailable")
        if len(self.bindings) >= 16 or any(
            b.slot is slot for b in self.bindings.values()
        ):
            raise ValueError("receiver already bound or at capacity")
        binding = Binding(peer_id, slot, self.service.profile)
        if not self._current(binding, now):
            raise ValueError("dedicated peer not playing/current")
        handle = ReceiverCapability()
        self.bindings[handle] = binding
        return handle

    def _binding(self, receiver, now):
        self._check()
        if type(receiver) is not ReceiverCapability:
            raise ValueError("issued receiver capability required")
        binding = self.bindings.get(receiver)
        if binding is None or not self._current(binding, now):
            if binding is not None:
                binding.invalid = True
            raise ValueError("stale or foreign receiver capability")
        observation = binding.slot.owner.last_observation
        if observation is not None:
            body, received, sequence = observation
            # The worker can publish between the API-entry clock read and this
            # atomic tuple read. Fence it with a clock read AFTER capturing it.
            binding.observe_native(body, received, sequence, self._now())
        return binding

    def report(self, receiver, sample):
        self.report_at(receiver, sample, self._now())

    def report_at(self, receiver, sample, received_ns):
        """Trusted host adapter stamps receipt before main-loop queueing, never caller JSON."""
        now = self._now()
        integer(received_ns, 0, now)
        if now - received_ns > BROWSER_FRESH_NS:
            raise ValueError("queued receiver observation stale")
        binding = self._binding(receiver, now)
        now = self._now()
        try:
            binding.observe_browser(sample, received_ns)
        except ValueError:
            if binding.operation is not None:
                binding.operation.cancelled.set()
            raise
        if binding.operation is not None and not binding.operation.done.is_set():
            binding.operation.publish(sample, binding.ready(now), received_ns)

    def inspect(self, receiver):
        now = self._now()
        binding = self._binding(receiver, now)
        now = self._now()
        result = {
            "status": "ready_for_dry_run"
            if binding.ready(now)
            else "insufficient_or_stale",
            "continuity_ready": binding.continuity_ready(now),
            "browser_basis": "declared_counters_not_authenticated_playback",
            "native_basis": "bound_connection_and_source_progress",
            "dispatch_available": False,
            "budget_reserved": False,
            "live_authority": False,
        }

        if result["status"] != "ready_for_dry_run":
            result["readiness_diagnostics"] = binding.readiness_diagnostics(now)
        return result

    def prepare(self, capability, receiver, request_id, target_fps, duration_ns):
        self._check(capability)
        if capability is not self.capability:
            raise ValueError("local owner capability required")
        now = self._now()
        binding = self._binding(receiver, now)
        now = self._now()
        if binding.operation is not None or not binding.ready(now):
            raise ValueError("receiver/native preconditions unavailable")
        request = Request(request_id, binding.generation, target_fps, duration_ns)
        prior_fps = binding.native[-1][0]["configured_fps"]
        if (
            not self.policy.minimum_fps
            <= target_fps
            < prior_fps
            <= self.policy.maximum_fps
            or not self.policy.settling_ns
            < duration_ns
            <= self.policy.maximum_duration_ns
            or 100 * (prior_fps - target_fps)
            > self.policy.maximum_reduction_percent * prior_fps
        ):
            raise ValueError("request outside local owner policy")
        self._request_ledger(request)
        if request_id in self.drafts:
            old_receiver, old = self.drafts[request_id]
            if old_receiver is not receiver or old.request != request:
                raise ValueError("local request identity conflict")
            self.recheck(capability, old)
            return old
        if len(self.drafts) >= 64:
            raise ValueError("local draft capacity exceeded")
        draft = RequestDraft(
            request,
            digest(asdict(request)),
            binding.token,
            binding.offer_hash,
            digest(binding.settings),
            self.policy_hash,
            min(
                now + DRAFT_FRESH_NS,
                binding.native[-1][1] + NATIVE_FRESH_NS,
                *(value + BROWSER_FRESH_NS for value in binding.progress.values()),
            ),
        )
        self.drafts[request_id] = (receiver, draft)
        return draft

    def recheck(self, capability, draft):
        self._check(capability)
        if capability is not self.capability or type(draft) is not RequestDraft:
            raise ValueError("issued local request draft required")
        row = self.drafts.get(draft.request.request_id)
        if row is None or row[1] is not draft:
            raise ValueError("foreign local request draft")
        now = self._now()
        binding = self._binding(row[0], now)
        now = self._now()
        if (
            now > draft.expires_ns
            or not binding.ready(now)
            or draft.request.generation != binding.generation
            or draft.token != binding.token
            or draft.offer_hash != binding.offer_hash
            or draft.settings_hash != digest(binding.settings)
            or draft.policy_hash != self.policy_hash
        ):
            raise ValueError("local request draft expired or binding changed")
        self._request_ledger(draft.request)
        return draft

    def dispatch(self, capability, draft):
        """Explicit local engineering call; production sources cannot dispatch."""
        self._check(capability)
        if capability is not self.capability or type(draft) is not RequestDraft:
            raise ValueError("issued local owner request required")
        row = self.drafts.get(draft.request.request_id)
        if row is None or row[1] is not draft:
            raise ValueError("issued local owner draft required")
        prior = self.operations.get(draft.request.request_id)
        if prior is not None:
            if prior[0] is not draft:
                raise ValueError("engineering request identity conflict")
            return prior[1]
        self.recheck(capability, draft)
        config = getattr(self.service, "control", None)
        if (
            type(config) is not EngineeringControl
            or not config.matches_source(self.service.source)
            or config.directory != self.directory
            or config.policy != self.policy
            or (config.device, config.inode) != self.directory_identity
        ):
            raise ValueError("explicit contained engineering configuration required")
        config.check_capture()
        if any(not op.done.is_set() for _draft, op in self.operations.values()):
            raise ValueError("owner/session engineering action already active")
        binding = self._binding(row[0], self._now())
        sample, observed_ns = binding.browser[-1]
        operation = ProbeOperation(draft, sample, observed_ns)
        self.service.submit_probe(binding.peer_id, operation)
        binding.operation = operation
        self.operations[draft.request.request_id] = (draft, operation)
        return operation

    def cancel(self, capability, operation):
        self._check(capability)
        if capability is not self.capability or not any(
            op is operation for _draft, op in self.operations.values()
        ):
            raise ValueError("issued engineering operation required")
        if not operation.done.is_set():
            operation.cancelled.set()

    def unbind(self, capability, receiver):
        self._check(capability)
        if (
            capability is not self.capability
            or type(receiver) is not ReceiverCapability
        ):
            raise ValueError("issued owner/receiver capability required")
        binding = self.bindings.pop(receiver, None)
        if binding is None:
            raise ValueError("receiver binding unavailable")
        binding.invalid = True
        if binding.operation is not None:
            binding.operation.cancelled.set()
