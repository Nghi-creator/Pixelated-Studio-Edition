"""Controller-side bounded commands; retains controller and worker clocks separately."""

import hashlib
import re
import time
from copy import deepcopy
from dataclasses import asdict

from .channel import STATE, OwnedDirectory
from .lifecycle import RECIPES
from .peer import MAX_ACK_BYTES, METHOD, OPERATIONS, command, decode, encode

ERROR = "invalid_challenge_handle"


class ChallengeHandle:
    def __init__(self, local, slot, recipe, *, clock=time.monotonic_ns, sleep=time.sleep):
        if type(recipe) is not str or recipe not in RECIPES:
            raise ValueError(ERROR)
        self.directory = OwnedDirectory(local.directory)
        self.slot, self.token, self.recipe = slot, slot.token, recipe
        self.generation = asdict(slot.owner.generation)
        self.clock, self.sleep = clock, sleep
        self.sequence, self.report_sequence, self.channel_id = 0, 0, None
        self.started_at, self.stopped = None, False
        self._records = []
        try:
            self.sample()
        except BaseException:
            self.directory.close()
            raise

    def current(self):
        s = self.slot
        if (
            s.token != self.token
            or asdict(s.owner.generation) != self.generation
            or s.failure
            or s.stop.is_set()
            or s.done.is_set()
        ):
            raise ValueError(ERROR)

    def _snapshot(self, value):
        if (
            type(value) is not dict
            or value.get("method") != METHOD
            or value.get("generation") != self.generation
            or value.get("recipe") != self.recipe
            or value.get("clock") != "worker_monotonic_ns"
            or value.get("cadence_application_verified") is not False
            or type(value.get("observed_ns")) is not int
            or type(value.get("snapshot_start_ns")) is not int
            or not 0 <= value["snapshot_start_ns"] <= value["observed_ns"]
            or type(value.get("command_sequence")) is not int
            or value["command_sequence"] != self.sequence
            or value.get("failed") is not False
            or value.get("expired") is not False
        ):
            raise ValueError(ERROR)
        channel_id = value.get("channel_id")
        if type(channel_id) is not str or re.fullmatch(r"[a-f0-9]{64}", channel_id) is None:
            raise ValueError(ERROR)
        if self.channel_id is None:
            self.channel_id = channel_id
        if channel_id != self.channel_id:
            raise ValueError(ERROR)
        if (
            value.get("clock_id")
            != "challenge-worker-monotonic-" + hashlib.sha256(encode(self.generation)).hexdigest()
        ):
            raise ValueError(ERROR)
        return value

    def sample(self, *, fresh=False, timeout_ns=600_000_000):
        start = self.clock()
        while self.clock() - start <= timeout_ns:
            self.current()
            try:
                frame = decode(self.directory.read(STATE, MAX_ACK_BYTES), MAX_ACK_BYTES)
            except FileNotFoundError:
                frame = None
            if frame is not None:
                if (
                    type(frame) is not dict
                    or set(frame) != {"report_sequence", "snapshot"}
                    or type(frame["report_sequence"]) is not int
                ):
                    raise ValueError(ERROR)
                sequence = frame["report_sequence"]
                if sequence < self.report_sequence or sequence < 1:
                    raise ValueError(ERROR)
                if not fresh or sequence > self.report_sequence:
                    snapshot = self._snapshot(frame["snapshot"])
                    if self.clock() - start > timeout_ns:
                        raise ValueError(ERROR)
                    self.report_sequence = sequence
                    return deepcopy(snapshot)
            self.sleep(0.005)
        raise ValueError(ERROR)

    def send(self, operation):
        if operation not in OPERATIONS or self.sequence >= 32:
            raise ValueError(ERROR)
        self.current()
        self.sequence += 1
        raw = encode(
            command(self.generation, self.recipe, self.channel_id, self.sequence, operation)
        )
        start = self.clock()
        self.directory.write(f"n11-challenge-command-{self.sequence:02d}.json", raw)
        timeout = (
            4_000_000_000
            if operation == "close"
            else 3_000_000_000
            if operation in ("start", "prepare_relief")
            else 600_000_000
        )
        if operation == "start":
            self.started_at = start
        while self.clock() - start <= timeout:
            self.current()
            try:
                ack_raw = self.directory.read(
                    f"n11-challenge-ack-{self.sequence:02d}.json", MAX_ACK_BYTES
                )
            except FileNotFoundError:
                self.sleep(0.005)
                continue
            ack = decode(ack_raw, MAX_ACK_BYTES)
            self._records.append(
                dict(
                    command_json=raw.decode(),
                    ack_json=ack_raw.decode(),
                    request_at_ns=start,
                    ack_at_ns=self.clock(),
                )
            )
            if (
                type(ack) is not dict
                or ack.get("method") != METHOD
                or ack.get("generation") != self.generation
                or ack.get("recipe") != self.recipe
                or ack.get("channel_id") != self.channel_id
                or ack.get("command_sequence") != self.sequence
                or ack.get("operation") != operation
                or ack.get("command_sha256") != "sha256:" + hashlib.sha256(raw).hexdigest()
                or ack.get("status") != "completed"
                or ack.get("live_authority") is not False
                or self.clock() - start > timeout
            ):
                raise ValueError(ERROR)
            self._snapshot(ack.get("snapshot"))
            if operation == "close":
                self.stopped = True
            return deepcopy(ack)
        raise ValueError(ERROR)

    def wait_established(self):
        start = self.clock()
        while self.clock() - start < 1_500_000_000:
            value = self.sample(fresh=True)
            ready = value.get("ready_not_before_ns")
            if type(ready) is int and value["observed_ns"] >= ready:
                if self.clock() - start >= 1_500_000_000:
                    raise ValueError(ERROR)
                return value
        raise ValueError(ERROR)

    def alive(self):
        self.current()
        if (
            self.started_at is None
            or self.stopped
            or self.clock() - self.started_at >= 20_000_000_000
        ):
            raise ValueError(ERROR)

    def stop(self):
        if not self.stopped:
            return self.send("close")
        return decode(self._records[-1]["ack_json"].encode(), MAX_ACK_BYTES)

    @property
    def transcript(self):
        return dict(
            schema_version="n11-challenge-command-transcript-v1",
            recipe=self.recipe,
            generation=deepcopy(self.generation),
            channel_id=self.channel_id,
            controller_clock="controller_monotonic_ns",
            records=deepcopy(self._records),
        )

    def release(self):
        self.directory.close()
