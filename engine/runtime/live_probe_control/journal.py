"""Bounded N10 private ledger, separate from N5 plans and fault leases."""

import copy
import json
import os
import re
from dataclasses import asdict

from private_journal import PrivateJournal

from .contracts import Generation, Request, Result, Snapshot, digest, integer


def unique(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate controller journal key")
        result[key] = value
    return result


def validate(value):
    if not isinstance(value, dict) or set(value) != {
        "version",
        "policy_hash",
        "state",
        "actions",
        "reserved_ns",
        "cooldown_until_ns",
        "clock_boot",
        "active",
        "history",
        "content_hash",
    }:
        raise ValueError("invalid cadence journal fields")
    content = {key: item for key, item in value.items() if key != "content_hash"}
    if value["content_hash"] != digest(content):
        raise ValueError("cadence journal content hash mismatch")
    if value["version"] != "n10-cadence-journal-v1" or value["state"] not in (
        "clean",
        "active",
        "dirty",
        "restored_pending_watchdog",
    ):
        raise ValueError("invalid cadence journal state")
    if (
        type(value["policy_hash"]) is not str
        or re.fullmatch(r"[a-f0-9]{64}", value["policy_hash"]) is None
    ):
        raise ValueError("invalid cadence policy hash")
    integer(value["actions"], 0, 64)
    integer(value["reserved_ns"], 0, 60 * 10**9)
    integer(value["cooldown_until_ns"], 0, 2**63 - 1)
    if (
        type(value["clock_boot"]) is not str
        or re.fullmatch(
            r"[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}", value["clock_boot"]
        )
        is None
    ):
        raise ValueError("invalid boot identity")
    history = value["history"]
    if not isinstance(history, list) or len(history) > 64:
        raise ValueError("invalid cadence request history")
    ids = set()
    total = 0
    active_count = 0
    for row in history:
        if not isinstance(row, dict) or set(row) != {
            "request",
            "request_hash",
            "prior",
            "process",
            "reserved_ns",
            "result",
            "failure",
        }:
            raise ValueError("invalid cadence request record")
        request = dict(row["request"])
        request["generation"] = Generation(**request["generation"])
        parsed = Request(**request)
        if parsed.request_id in ids or row["request_hash"] != digest(asdict(parsed)):
            raise ValueError("invalid cadence request identity")
        ids.add(parsed.request_id)
        prior = dict(row["prior"])
        prior["generation"] = Generation(**prior["generation"])
        previous = Snapshot(**prior)
        if (
            previous.generation != parsed.generation
            or not parsed.target_fps < previous.configured_fps
        ):
            raise ValueError("cadence preimage/request mismatch")
        process = row["process"]
        if not isinstance(process, dict) or set(process) != {"boot", "pid", "start"}:
            raise ValueError("invalid private process identity")
        integer(process["pid"], 1, 2**31 - 1)
        if (
            type(process["boot"]) is not str
            or re.fullmatch(
                r"[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}", process["boot"]
            )
            is None
            or type(process["start"]) is not str
            or re.fullmatch(r"[0-9]{1,20}", process["start"]) is None
        ):
            raise ValueError("invalid private process lifetime")
        total += integer(row["reserved_ns"], 1, 7 * 10**9)
        if row["failure"] is not None:
            failure = Result(**row["failure"])
            if failure.request_id != parsed.request_id or failure.restoration != "unknown":
                raise ValueError("invalid retained cadence failure")
        if row["result"] is None:
            active_count += 1
            if value["active"] != parsed.request_id:
                raise ValueError("unbound active cadence request")
        else:
            result = Result(**row["result"])
            if result.request_id != parsed.request_id:
                raise ValueError("cadence result identity mismatch")
    if value["actions"] != len(history) or total != value["reserved_ns"]:
        raise ValueError("cadence budget ledger does not reconstruct")
    if (value["state"] == "clean") != (value["active"] is None) or active_count != int(
        value["active"] is not None
    ):
        raise ValueError("cadence active state mismatch")
    return value


class CadenceJournal(PrivateJournal):
    def _read(self):
        try:
            fd = self._open("journal.json", os.O_RDONLY)
        except FileNotFoundError:
            return None
        try:
            data = os.read(fd, 65537)
            if len(data) > 65536:
                raise ValueError("cadence journal exceeds bound")
            return validate(json.loads(data, object_pairs_hook=unique))
        finally:
            os.close(fd)

    def save(self, value):
        value = copy.deepcopy(value)
        value.pop("content_hash", None)
        value["content_hash"] = digest(value)
        value = validate(value)
        if len(json.dumps(value, separators=(",", ":")).encode()) > 65536:
            raise ValueError("cadence journal exceeds bound")
        self._write(value)
