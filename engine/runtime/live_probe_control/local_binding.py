"""Bounded peer observations and immutable request drafts; no owner capabilities."""

import copy
import re
from collections import deque
from dataclasses import asdict, dataclass

from .contracts import SECOND, Request, alias, digest, integer
from .peer_protocol import PROFILE_ENCODERS, event_body

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

    def _continuity_reasons(self, now):
        """Shared bounded checks for readiness and its diagnostic explanation."""
        reasons = []
        if self.invalid:
            reasons.append("binding_invalid")
        if len(self.native) < 2:
            reasons.append("native_history_insufficient")
        else:
            first, stamp = self.native[0]
            last, received = self.native[-1]
            if not 0 <= now - received <= NATIVE_FRESH_NS:
                reasons.append("native_receipt_stale")
            if received - stamp > NATIVE_FRESH_NS:
                reasons.append("native_pair_gap")
            if any(
                body["state"] != "playing"
                or body["connection_state"] != "connected"
                or body["ice_connection_state"] not in ("connected", "completed")
                or any(body[k] is None for k in (*SETTINGS, *COUNTERS))
                for body in (first, last)
            ):
                reasons.append("native_health_or_fields_unavailable")
            if any(
                type(first[k]) is not int
                or type(last[k]) is not int
                or last[k] <= first[k]
                for k in ("capture_buffers", "encoded_buffers")
            ):
                reasons.append("native_source_progress_absent")
        if len(self.native) >= 2 and self.native[-1][0]["configured_fps"] is not None:
            if not 24 <= self.native[-1][0]["configured_fps"] <= 60:
                reasons.append("native_fps_out_of_range")
        if self.settings is None:
            reasons.append("native_settings_unavailable")
        if len(self.browser) < 2:
            reasons.append("browser_history_insufficient")
        else:
            first, start = self.browser[0]
            last, end = self.browser[-1]
            if not 0 <= now - end <= BROWSER_FRESH_NS:
                reasons.append("browser_receipt_stale")
            if (
                end - start < 200000000
                or last.elapsed_ns - first.elapsed_ns < 200000000
            ):
                reasons.append("browser_history_span_insufficient")
        for name, stamp in self.progress.items():
            if stamp is None or not 0 <= now - stamp <= BROWSER_FRESH_NS:
                reasons.append("browser_" + name + "_progress_stale")
        return reasons

    def continuity_ready(self, now):
        return not self._continuity_reasons(now)

    def readiness_diagnostics(self, now):
        """Bounded failure explanation only; never used to grant admission."""
        native = [
            dict(
                received_age_ns=now - stamp,
                state=body["state"],
                connection_state=body["connection_state"],
                ice_connection_state=body["ice_connection_state"],
                configured_fps=body["configured_fps"],
                negotiated_fps=body["negotiated_fps"],
                capture_buffers=body["capture_buffers"],
                encoded_buffers=body["encoded_buffers"],
            )
            for body, stamp in self.native
        ]
        browser = [
            dict(
                received_age_ns=now - stamp,
                sequence=sample.sequence,
                elapsed_ns=sample.elapsed_ns,
                frames_decoded=sample.frames_decoded,
                presented_frames=sample.presented_frames,
            )
            for sample, stamp in list(self.browser)[-2:]
        ]
        reasons = self._continuity_reasons(now)
        if self.operation is None and any(
            body["configured_fps"] != self.expected[0]
            or body["negotiated_fps"] != self.expected[1]
            for body, _ in self.native
        ):
            reasons.append("fresh_action_caps_not_restored")
        return dict(
            reasons=reasons,
            native=native,
            browser=browser,
            progress_age_ns={
                key: None if stamp is None else now - stamp
                for key, stamp in self.progress.items()
            },
            native_fresh_ns=NATIVE_FRESH_NS,
            browser_fresh_ns=BROWSER_FRESH_NS,
        )

    def ready(self, now):
        return self.continuity_ready(now) and (
            self.operation is not None
            or all(
                body["configured_fps"] == self.expected[0]
                and body["negotiated_fps"] == self.expected[1]
                for body, _ in self.native
            )
        )
