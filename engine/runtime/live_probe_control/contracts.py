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
