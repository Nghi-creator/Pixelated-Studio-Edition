"""Closed worker-local command endpoint; transport and media authority stay separate."""

import hashlib
import json
import re
from copy import deepcopy

from .lifecycle import RECIPES

METHOD = "n11-physical-challenge-peer-v1"
ERROR = "invalid_challenge_peer_command"
OPERATIONS = (
    "start",
    "begin_degraded",
    "end_degraded",
    "prepare_relief",
    "dispatch_relief",
    "begin_relief",
    "end_relief",
    "begin_recovery",
    "end_recovery",
    "close",
)
MAX_COMMAND_BYTES = 4096
MAX_ACK_BYTES = 256 * 1024


def encode(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()


def _object(pairs):
    value = {}
    for key, item in pairs:
        if key in value:
            raise ValueError(ERROR)
        value[key] = item
    return value


def decode(raw, limit):
    if type(raw) is not bytes or not 0 < len(raw) <= limit:
        raise ValueError(ERROR)
    try:
        value = json.loads(
            raw,
            object_pairs_hook=_object,
            parse_constant=lambda _: (_ for _ in ()).throw(ValueError(ERROR)),
        )
        if encode(value) != raw:
            raise ValueError(ERROR)
        return value
    except (ValueError, TypeError, RecursionError):
        raise ValueError(ERROR) from None


def command(generation, recipe, channel_id, sequence, operation):
    return dict(
        method=METHOD,
        generation=deepcopy(generation),
        recipe=recipe,
        channel_id=channel_id,
        sequence=sequence,
        operation=operation,
    )


class ChallengeEndpoint:
    def __init__(self, lifecycle, recipe, channel_id):
        if (
            type(recipe) is not str
            or recipe not in RECIPES
            or type(channel_id) is not str
            or re.fullmatch(r"[a-f0-9]{64}", channel_id) is None
        ):
            raise ValueError(ERROR)
        self.lifecycle, self.recipe, self.channel_id = lifecycle, recipe, channel_id
        self.generation = deepcopy(lifecycle.generation)
        self.clock_id = (
            "challenge-worker-monotonic-" + hashlib.sha256(encode(self.generation)).hexdigest()
        )
        self.sequence = 0

    def snapshot(self):
        c = self.lifecycle
        observed = c._now()
        witness = None
        if not c.failed and not c.expired:
            witness = c.witness() if c.state == "active" else c.reference_witness()
        return dict(
            method=METHOD,
            channel_id=self.channel_id,
            generation=deepcopy(self.generation),
            recipe=self.recipe,
            command_sequence=self.sequence,
            observed_ns=c._now(),
            state=c.state,
            failed=c.failed,
            expired=c.expired,
            condition_deadline_ns=c.deadline_ns,
            ready_not_before_ns=c._ready_at,
            witness=witness,
            cadence_application_verified=False,
            clock="worker_monotonic_ns",
            clock_id=self.clock_id,
            snapshot_start_ns=observed,
        )

    def execute(self, raw):
        value = decode(raw, MAX_COMMAND_BYTES)
        expected = (
            command(
                self.generation,
                self.recipe,
                self.channel_id,
                self.sequence + 1,
                value.get("operation"),
            )
            if type(value) is dict
            else None
        )
        if (
            type(value) is not dict
            or type(value.get("sequence")) is not int
            or not 1 <= value["sequence"] <= 32
            or value.get("operation") not in OPERATIONS
            or encode(value) != encode(expected)
        ):
            raise ValueError(ERROR)
        self.sequence += 1  # Consume before execution: a failed request is never retried.
        c, op = self.lifecycle, value["operation"]
        status = "completed"
        try:
            if op == "start":
                c.start(self.recipe)
            elif op.startswith("begin_"):
                c.begin_phase(op[6:])
            elif op.startswith("end_"):
                if c._phase != op[4:]:
                    raise ValueError(ERROR)
                c.finish_phase()
            elif op == "prepare_relief":
                c.prepare_relief()
            elif op == "dispatch_relief":
                c.dispatch_relief()
            elif c.close() is not True:
                raise ValueError(ERROR)
            if c.failed or c.expired:
                raise ValueError(ERROR)
            snapshot = self.snapshot()
        except Exception:
            c.failed = True
            c.close()
            status = "failed"
            snapshot = self.snapshot()
        result = dict(
            method=METHOD,
            channel_id=self.channel_id,
            generation=deepcopy(self.generation),
            recipe=self.recipe,
            command_sequence=self.sequence,
            operation=op,
            status=status,
            command_sha256="sha256:" + hashlib.sha256(raw).hexdigest(),
            snapshot=snapshot,
            events=list(c.events),
            live_authority=False,
        )
        if len(encode(result)) > MAX_ACK_BYTES:
            raise ValueError(ERROR)
        return result
