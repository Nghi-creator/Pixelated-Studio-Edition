"""Process-local admission and explicit synthetic engineering dispatch; no live authority."""

import copy
import os
import re
import time
from collections import deque
from dataclasses import asdict, dataclass
from pathlib import Path

from .contracts import SECOND, Generation, Policy, Request, alias, digest, integer
from .journal import CadenceJournal
from .peer_protocol import PROFILE_ENCODERS, event_body
from .probe_transport import EngineeringControl, ProbeOperation

NATIVE_FRESH_NS = 1500000000
BROWSER_FRESH_NS = 750000000
DRAFT_FRESH_NS = 250000000
SETTINGS = (
    "configured_fps",
    "negotiated_fps",
    "width",
    "height",
    "target_bitrate",
    "cpu_used",
    "max_quantizer",
)
COUNTERS = ("capture_buffers", "encoded_buffers", "queue_overruns_total")


class OwnerCapability:
    """Identity checked by its issuer; never represented by caller JSON/aliases."""

    __slots__ = ()


class ReceiverCapability:
    """Allows declared observations only; cannot prepare local requests."""

    __slots__ = ()


@dataclass(frozen=True)
class ReceiverSample:
    sequence: int
    clock_id: str
    elapsed_ns: int
    frames_decoded: int
    presented_frames: int

    def __post_init__(self):
        alias(self.clock_id)
        for key in ("sequence", "elapsed_ns", "frames_decoded", "presented_frames"):
            integer(getattr(self, key), 0, 2**53 - 1)


@dataclass(frozen=True)
class RequestDraft:
    request: Request
    request_hash: str
    token: str
    offer_hash: str
    settings_hash: str
    policy_hash: str
    expires_ns: int
    dispatch_available: bool = False
    budget_reserved: bool = False
    live_authority: bool = False

    def __post_init__(self):
        if type(self.request) is not Request or self.request_hash != digest(
            asdict(self.request)
        ):
            raise ValueError("invalid bound request draft")
        alias(self.token)
        integer(self.expires_ns, 0, 2**63 - 1)
        for value in (self.offer_hash, self.settings_hash, self.policy_hash):
            if type(value) is not str or re.fullmatch(r"[a-f0-9]{64}", value) is None:
                raise ValueError("invalid draft binding hash")
        if any(
            flag is not False
            for flag in (
                self.dispatch_available,
                self.budget_reserved,
                self.live_authority,
            )
        ):
            raise ValueError(
                "admission draft cannot grant dispatch, budget or live authority"
            )


class Binding:
    def __init__(self, peer_id, slot, profile):
        self.peer_id, self.slot, self.token = peer_id, slot, slot.token
        self.generation = slot.owner.generation
        self.offer_hash = digest({"sdp": slot.sdp})
        self.native = deque(maxlen=2)
        self.native_sequence = None
        self.browser = deque(maxlen=8)
        self.last_counters = {}
        self.settings = None
        self.operation = None
        cpu, quantizer = PROFILE_ENCODERS[profile["id"]]
        self.expected = (
            profile["fps"],
            profile["fps"],
            640,
            480,
            profile["bitrate_kbps"] * 1000,
            cpu,
            quantizer,
        )
        self.invalid = False
        self.progress = {"frames_decoded": None, "presented_frames": None}

    def observe_native(self, body, received, sequence, now):
        try:
            event_body("snapshot", body)
            integer(received, 0, now)
            integer(sequence, 1, 2**53 - 1)
            if self.native:
                old, stamp = self.native[-1]
                if body["read_end_ns"] == old["read_end_ns"]:
                    if (
                        stamp != received
                        or body != old
                        or sequence != self.native_sequence
                    ):
                        raise ValueError("changed native observation")
                    return
                if sequence != self.native_sequence + 1:
                    raise ValueError("native observation skipped")
                if body["read_start_ns"] < old["read_end_ns"] or received <= stamp:
                    raise ValueError("native observation reversed")
            for key in COUNTERS:
                value = body[key]
                if value is not None:
                    if value < self.last_counters.get(key, 0):
                        raise ValueError("native counter reset")
                    self.last_counters[key] = value
            settings = tuple(body[k] for k in SETTINGS)
            if all(v is not None for v in settings):
                allowed = {self.expected[0]}
                if self.operation is not None:
                    allowed.add(self.operation.request.target_fps)
                if settings[2:] != self.expected[2:] or any(
                    v not in allowed for v in settings[:2]
                ):
                    raise ValueError("unsupported native profile/caps")
                self.settings = self.expected
                if (
                    self.operation is not None
                    and self.operation.done.is_set()
                    and settings == self.expected
                ):
                    self.operation = None
            self.native.append((copy.deepcopy(body), received))
            self.native_sequence = sequence
        except (ValueError, TypeError, KeyError):
            self.invalid = True
            raise ValueError("invalid bound native observation") from None

    def observe_browser(self, sample, now):
        try:
            if type(sample) is not ReceiverSample:
                raise ValueError("typed declared receiver sample required")
            if self.browser:
                prior, received = self.browser[-1]
                if (
                    sample.clock_id != prior.clock_id
                    or sample.sequence != prior.sequence + 1
                    or not 0 < sample.elapsed_ns - prior.elapsed_ns <= SECOND
                    or not 0 < now - received <= SECOND
                ):
                    raise ValueError("declared receiver sequence/clock gap")
                for key in self.progress:
                    if getattr(sample, key) < getattr(prior, key):
                        raise ValueError("declared receiver counter reset")
                    if getattr(sample, key) > getattr(prior, key):
                        self.progress[key] = now
            elif sample.sequence != 0:
                raise ValueError("declared receiver must start at sequence zero")
            self.browser.append((sample, now))
        except (ValueError, TypeError):
            self.invalid = True
            raise ValueError("invalid bound declared receiver observation") from None

    def ready(self, now):
        if self.invalid or len(self.native) < 2 or len(self.browser) < 2:
            return False
        first, stamp = self.native[0]
        last, received = self.native[-1]
        if (
            not 0 <= now - received <= NATIVE_FRESH_NS
            or received - stamp > NATIVE_FRESH_NS
        ):
            return False
        for body in (first, last):
            if (
                body["state"] != "playing"
                or body["connection_state"] != "connected"
                or body["ice_connection_state"] not in ("connected", "completed")
                or any(body[k] is None for k in (*SETTINGS, *COUNTERS))
                or (
                    self.operation is None
                    and (
                        body["configured_fps"] != self.expected[0]
                        or body["negotiated_fps"] != self.expected[1]
                    )
                )
            ):
                return False
        if any(last[k] <= first[k] for k in ("capture_buffers", "encoded_buffers")):
            return False
        if self.settings is None or not 24 <= last["configured_fps"] <= 60:
            return False
        start, start_received = self.browser[0]
        end, end_received = self.browser[-1]
        return (
            0 <= now - end_received <= BROWSER_FRESH_NS
            and end_received - start_received >= 200000000
            and end.elapsed_ns - start.elapsed_ns >= 200000000
            and all(
                value is not None and 0 <= now - value <= BROWSER_FRESH_NS
                for value in self.progress.values()
            )
        )


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
        return {
            "status": "ready_for_dry_run"
            if binding.ready(now)
            else "insufficient_or_stale",
            "browser_basis": "declared_counters_not_authenticated_playback",
            "native_basis": "bound_connection_and_source_progress",
            "dispatch_available": False,
            "budget_reserved": False,
            "live_authority": False,
        }

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
            or self.service.source != "isolated_synthetic"
            or config.directory != self.directory
            or config.policy != self.policy
            or (config.device, config.inode) != self.directory_identity
        ):
            raise ValueError("explicit synthetic engineering configuration required")
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
