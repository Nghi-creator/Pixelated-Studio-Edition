"""Explicit synthetic engineering configuration and bounded local operation handles."""

import copy
import os
import re
import threading
from dataclasses import asdict, dataclass
from pathlib import Path

from .contracts import Generation, Policy, Request, Result, digest, integer
from .journal import CadenceJournal


def hash_value(value):
    if type(value) is not str or re.fullmatch(r"[a-f0-9]{64}", value) is None:
        raise ValueError("invalid probe binding hash")
    return value


def request_value(value):
    if type(value) is not dict or set(value) != {
        "request_id",
        "generation",
        "target_fps",
        "duration_ns",
    }:
        raise ValueError("closed probe request required")
    value = dict(value)
    value["generation"] = Generation(**value["generation"])
    return Request(**value)


@dataclass(frozen=True)
class EngineeringControl:
    directory: str
    policy: Policy
    device: int
    inode: int

    def __post_init__(self):
        if (
            type(self.directory) is not str
            or not Path(self.directory).is_absolute()
            or len(self.directory.encode()) > 4096
        ):
            raise ValueError("absolute private owner/session directory required")
        if type(self.policy) is not Policy:
            raise ValueError("typed engineering policy required")
        integer(self.device, 0, 2**63 - 1)
        integer(self.inode, 1, 2**63 - 1)

    @classmethod
    def open(cls, directory, policy):
        with CadenceJournal(directory) as store:
            info = os.fstat(store.directory_fd)
            value = cls(str(directory), policy, info.st_dev, info.st_ino)
            value.check(store)
            return value

    @classmethod
    def from_wire(cls, value):
        if type(value) is not dict or set(value) != {
            "directory",
            "policy",
            "device",
            "inode",
        }:
            raise ValueError("closed engineering configuration required")
        return cls(
            value["directory"],
            Policy(**value["policy"]),
            value["device"],
            value["inode"],
        )

    def check(self, store):
        info = os.fstat(store.directory_fd)
        if (info.st_dev, info.st_ino) != (self.device, self.inode):
            raise ValueError("owner/session directory replaced")
        if store.journal is not None and store.journal["policy_hash"] != digest(
            asdict(self.policy)
        ):
            raise ValueError("owner/session policy mismatch")

    def wire(self):
        return asdict(self)


def receiver_value(value):
    if type(value) is not dict or set(value) != {
        "sequence",
        "frames_decoded",
        "presented_frames",
        "healthy",
        "observed_ns",
    }:
        raise ValueError("closed receiver lease required")
    for key in ("sequence", "frames_decoded", "presented_frames"):
        integer(value[key], 0, 2**53 - 1)
    integer(value["observed_ns"], 0, 2**63 - 1)
    if type(value["healthy"]) is not bool:
        raise ValueError("typed receiver health required")
    return value


class ProbeOperation:
    """Local handle, not a serialized authority token. One latest observation only."""

    live_authority = False

    def __init__(self, draft, sample, observed_ns):
        self.request = draft.request
        self.token = draft.token
        self.expires_ns = draft.expires_ns
        self.body = {
            "request": asdict(draft.request),
            "offer_hash": draft.offer_hash,
            "settings_hash": draft.settings_hash,
            "policy_hash": draft.policy_hash,
            "expires_ns": draft.expires_ns,
        }
        self.cancelled = threading.Event()
        self.done = threading.Event()
        self.lock = threading.Lock()
        self.latest = None
        self.result = None
        self.status = "queued"
        self.publish(sample, True, observed_ns)

    def publish(self, sample, healthy, observed_ns):
        value = receiver_value(
            {
                "sequence": sample.sequence,
                "frames_decoded": sample.frames_decoded,
                "presented_frames": sample.presented_frames,
                "healthy": healthy,
                "observed_ns": observed_ns,
            }
        )
        with self.lock:
            self.latest = value

    def lease(self):
        with self.lock:
            return copy.deepcopy(self.latest)

    def finish(self, body):
        if self.done.is_set():
            raise ValueError("duplicate probe outcome")
        result = Result(**body["result"]) if body["result"] is not None else None
        if body["request_id"] != self.request.request_id or (
            result is not None and result.request_id != self.request.request_id
        ):
            raise ValueError("probe result identity mismatch")
        self.result = result
        self.status = "observed" if self.result is not None else "rejected"
        self.done.set()

    def lost(self):
        if not self.done.is_set():
            self.status = "worker_lost"
            self.done.set()
