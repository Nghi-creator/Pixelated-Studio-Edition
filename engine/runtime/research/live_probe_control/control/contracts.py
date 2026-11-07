"""Closed local cadence-controller declarations; not qualified live policy."""

import hashlib
import json
import re
from dataclasses import asdict, dataclass

SECOND = 1000000000


def integer(value, minimum, maximum):
    if type(value) is not int or not minimum <= value <= maximum:
        raise ValueError("invalid bounded integer")
    return value


def alias(value):
    if type(value) is not str or re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,63}", value) is None:
        raise ValueError("invalid local alias")
    return value


def digest(value):
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()
    ).hexdigest()


@dataclass(frozen=True)
class Generation:
    owner: str
    pipeline: str
    peer: str

    def __post_init__(self):
        for value in asdict(self).values():
            alias(value)


@dataclass(frozen=True)
class Policy:
    minimum_fps: int
    maximum_fps: int
    maximum_duration_ns: int
    maximum_actions: int
    cumulative_duration_ns: int
    cooldown_ns: int
    maximum_reduction_percent: int
    settling_ns: int

    def __post_init__(self):
        integer(self.minimum_fps, 24, 60)
        integer(self.maximum_fps, self.minimum_fps, 60)
        integer(self.maximum_duration_ns, 1, 5 * SECOND)
        integer(self.maximum_actions, 1, 64)
        integer(self.cumulative_duration_ns, self.maximum_duration_ns, 60 * SECOND)
        integer(self.cooldown_ns, SECOND, 60 * SECOND)
        integer(self.maximum_reduction_percent, 1, 50)
        integer(self.settling_ns, 0, min(self.maximum_duration_ns, 500000000))


@dataclass(frozen=True)
class Request:
    request_id: str
    generation: Generation
    target_fps: int
    duration_ns: int

    def __post_init__(self):
        alias(self.request_id)
        if type(self.generation) is not Generation:
            raise ValueError("exact generation required")
        integer(self.target_fps, 24, 60)
        integer(self.duration_ns, 1, 5 * SECOND)


@dataclass(frozen=True)
class Snapshot:
    generation: Generation
    configured_fps: int
    negotiated_fps: int
    settings_hash: str
    healthy: bool

    def __post_init__(self):
        if type(self.generation) is not Generation or type(self.healthy) is not bool:
            raise ValueError("invalid snapshot identity/health")
        integer(self.configured_fps, 1, 60)
        integer(self.negotiated_fps, 1, 60)
        if (
            type(self.settings_hash) is not str
            or re.fullmatch(r"[a-f0-9]{64}", self.settings_hash) is None
        ):
            raise ValueError("invalid settings identity")


@dataclass(frozen=True)
class Result:
    request_id: str
    outcome: str
    restoration: str
    reason: str
    live_authority: bool = False

    def __post_init__(self):
        alias(self.request_id)
        if self.outcome not in ("completed", "aborted", "unknown", "interrupted_teardown"):
            raise ValueError("invalid controller outcome")
        if self.restoration not in ("verified_by_port", "unknown", "not_verified_teardown"):
            raise ValueError("invalid restoration outcome")
        if self.reason not in (
            "duration_elapsed",
            "cancelled",
            "health_abort",
            "apply_failed",
            "restore_failed",
            "generation_changed",
            "journal_failed",
            "worker_terminated",
        ):
            raise ValueError("invalid controller reason")
        if self.outcome == "completed" and (
            self.restoration != "verified_by_port" or self.reason != "duration_elapsed"
        ):
            raise ValueError("completed request needs restoration proof")
        if (self.outcome == "interrupted_teardown") != (
            self.restoration == "not_verified_teardown" and self.reason == "worker_terminated"
        ):
            raise ValueError("teardown outcome mismatch")
        if type(self.live_authority) is not bool or self.live_authority is not False:
            raise ValueError("controller cannot grant live authority")


FAILURE_DIAGNOSTIC_METHOD = "n11-cadence-failure-diagnostic-v1"
HEALTH_CHECKS = (
    "native_valid",
    "playing",
    "connected",
    "ice_connected",
    "buffers_present",
    "native_progress_fresh",
    "receiver_healthy",
    "capture_healthy",
    "receiver_valid",
    "receiver_reported_healthy",
    "receiver_receipt_fresh",
    "receiver_observation_fresh",
    "receiver_decode_fresh",
    "receiver_presentation_fresh",
)


def failure_diagnostic(value):
    """Bounded passive evidence, never a result or control-authority substitute."""
    if type(value) is not dict or set(value) != {"method", "check", "snapshot", "health_checks"}:
        raise ValueError("closed cadence diagnostic required")
    if value["method"] != FAILURE_DIAGNOSTIC_METHOD or value["check"] not in (
        "preimage_changed",
        "cancelled",
        "generation_changed",
        "snapshot_unhealthy",
        "settings_changed",
        "configured_fps_changed",
        "negotiated_fps_invalid",
        "negotiation_deadline",
        "apply_not_observed",
        "control_exception",
    ):
        raise ValueError("invalid cadence diagnostic check")
    snapshot = value["snapshot"]
    if snapshot is not None:
        if type(snapshot) is not dict or set(snapshot) != {
            "healthy",
            "configured_fps",
            "negotiated_fps",
            "generation_matches",
            "settings_match",
        }:
            raise ValueError("invalid cadence diagnostic snapshot")
        for key in ("healthy", "generation_matches", "settings_match"):
            if type(snapshot[key]) is not bool:
                raise ValueError("typed diagnostic flags required")
        integer(snapshot["configured_fps"], 1, 240)
        integer(snapshot["negotiated_fps"], 1, 240)
    checks = value["health_checks"]
    if checks is not None and (
        type(checks) is not dict
        or set(checks) != set(HEALTH_CHECKS)
        or any(v is not None and type(v) is not bool for v in checks.values())
    ):
        raise ValueError("invalid cadence health checks")
    return value
