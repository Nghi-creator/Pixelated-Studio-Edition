"""Authenticated relay observations bound to one live camera worker; no control endpoint."""

import hashlib
import re
import secrets
import time
from dataclasses import dataclass

from .local_owner import BROWSER_FRESH_NS, ReceiverSample


def observation_enabled(environment, workers):
    flag = environment.get("PIXELATED_RECEIVER_OBSERVATIONS", "0")
    if flag not in ("0", "1") or (flag == "1" and workers is None):
        raise ValueError("receiver observations require explicit dedicated workers")
    return flag == "1"


def _alias(value, maximum=128):
    return (
        type(value) is str
        and re.fullmatch(r"[A-Za-z0-9_-]{1," + str(maximum) + "}", value) is not None
    )


def _hash(value):
    return type(value) is str and re.fullmatch(r"[a-f0-9]{64}", value) is not None


def valid_bound(value):
    return (
        type(value) is dict
        and set(value) == {"peerId", "bindingId", "offerHash", "receiverSocketId"}
        and _alias(value["peerId"])
        and _alias(value["receiverSocketId"])
        and _hash(value["bindingId"])
        and _hash(value["offerHash"])
    )


def valid_report(value):
    if type(value) is not dict or set(value) != {
        "peerId",
        "bindingId",
        "offerHash",
        "receiverSocketId",
        "clockId",
        "sequence",
        "elapsedNs",
        "framesDecoded",
        "presentedFrames",
    }:
        return False
    return (
        valid_bound(
            {
                k: value[k]
                for k in ("peerId", "bindingId", "offerHash", "receiverSocketId")
            }
        )
        and _alias(value["clockId"], 64)
        and all(
            type(value[k]) is int and 0 <= value[k] <= 2**53 - 1
            for k in ("sequence", "elapsedNs", "framesDecoded", "presentedFrames")
        )
    )


@dataclass
class ReceiverRecord:
    slot: object
    token: str
    generation: object
    binding_id: str
    offer_hash: str
    receiver_socket_id: str | None = None
    sample: ReceiverSample | None = None
    received_ns: int | None = None
    attachment: tuple | None = None
    offset: int | None = None
    invalid: bool = False


class BrowserReceiverBridge:
    def __init__(self, workers, *, clock=time.monotonic_ns):
        self.workers, self.clock = workers, clock
        self.records = {}

    def _current(self, peer_id, record):
        slot = self.workers.active.get(peer_id)
        return (
            not record.invalid
            and not self.workers.closed
            and slot is record.slot
            and slot.token == record.token
            and slot.owner.generation == record.generation
            and slot.owner.state == "playing"
            and not slot.stop.is_set()
            and not slot.done.is_set()
            and slot.failure is None
            and 0 <= self.clock() - slot.seen_ns <= 3 * 10**9
            and hashlib.sha256(slot.sdp.encode()).hexdigest() == record.offer_hash
        )

    def retire(self, peer_id):
        record = self.records.pop(peer_id, None)
        if record is not None:
            self._invalidate(record)

    def _invalidate(self, record):
        record.invalid = True
        if record.attachment is not None:
            local, owner, receiver = record.attachment
            try:
                local.unbind(owner, receiver)
            except ValueError:
                pass  # A closed owner scope has already invalidated its handles.
            record.attachment = None

    def open(self, peer_id):
        slot = self.workers.active.get(peer_id)
        if slot is None or slot.owner is None or slot.owner.state != "playing":
            raise ValueError("current playing worker required")
        record = self.records.get(peer_id)
        if record is None or not self._current(peer_id, record):
            self.retire(peer_id)
            if len(self.records) >= self.workers.maximum:
                raise ValueError("receiver binding capacity exceeded")
            record = ReceiverRecord(
                slot,
                slot.token,
                slot.owner.generation,
                secrets.token_hex(32),
                hashlib.sha256(slot.sdp.encode()).hexdigest(),
            )
            self.records[peer_id] = record
        return {
            "peerId": peer_id,
            "bindingId": record.binding_id,
            "offerHash": record.offer_hash,
        }

    def bound(self, value):
        if not valid_bound(value):
            return False
        record = self.records.get(value["peerId"])
        if (
            record is None
            or not self._current(value["peerId"], record)
            or (value["bindingId"], value["offerHash"])
            != (record.binding_id, record.offer_hash)
        ):
            return False
        if (
            record.receiver_socket_id is not None
            and record.receiver_socket_id != value["receiverSocketId"]
        ):
            self._invalidate(record)
            return False
        record.receiver_socket_id = value["receiverSocketId"]
        return True

    def accept(self, value, received_ns):
        if not valid_report(value):
            return False
        record = self.records.get(value["peerId"])
        if (
            record is None
            or not self._current(value["peerId"], record)
            or (value["bindingId"], value["offerHash"], value["receiverSocketId"])
            != (record.binding_id, record.offer_hash, record.receiver_socket_id)
        ):
            return False
        now = self.clock()
        if (
            type(received_ns) is not int
            or not 0 <= now - received_ns <= BROWSER_FRESH_NS
        ):
            self._invalidate(record)
            return False
        sample = ReceiverSample(
            value["sequence"],
            value["clockId"],
            value["elapsedNs"],
            value["framesDecoded"],
            value["presentedFrames"],
        )
        prior = record.sample
        if (prior is None and sample.sequence != 0) or (
            prior is not None
            and (
                sample.sequence != prior.sequence + 1
                or sample.clock_id != prior.clock_id
                or not 0 < sample.elapsed_ns - prior.elapsed_ns <= 10**9
                or sample.frames_decoded < prior.frames_decoded
                or sample.presented_frames < prior.presented_frames
                or not 0 < received_ns - record.received_ns <= 10**9
            )
        ):
            self._invalidate(record)
            return False
        record.sample, record.received_ns = sample, received_ns
        if record.attachment is not None:
            local, _owner, receiver = record.attachment
            if record.offset is None:
                record.offset = sample.sequence
            scoped = ReceiverSample(
                sample.sequence - record.offset,
                sample.clock_id,
                sample.elapsed_ns,
                sample.frames_decoded,
                sample.presented_frames,
            )
            try:
                local.report_at(receiver, scoped, received_ns)
            except ValueError:
                self._invalidate(record)
                return False
        return True

    def attach(self, local, owner, peer_id, token):
        record = self.records.get(peer_id)
        if (
            record is None
            or not self._current(peer_id, record)
            or record.token != token
            or record.receiver_socket_id is None
            or record.attachment is not None
            or local.service is not self.workers
        ):
            raise ValueError("authenticated exact receiver binding unavailable")
        receiver = local.bind(owner, peer_id, token)
        record.attachment = (local, owner, receiver)
        # Never replay buffered reports with a new receipt timestamp. Only future
        # authenticated observations establish this local receiver's warmup.
        record.offset = None
        return receiver
