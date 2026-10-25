"""Closed private single-peer IPC. No executable pipelines or mutation commands."""

import json
import re
from dataclasses import asdict

from .contracts import Generation, digest, integer

VERSION = "n10-peer-ipc-v1"
MAX_LINE = 262144
MAX_BUFFER = 524288
MAX_COMMANDS = 256
PROFILE_ENCODERS = {"performance": (8, 56), "balanced": (6, 48), "quality": (4, 42)}
SNAPSHOT_COUNTERS = (
    "capture_buffers",
    "encoded_buffers",
    "queue_overruns_total",
    "pre_encoder_queue_level",
    "post_encoder_queue_level",
    "configured_fps",
    "negotiated_fps",
    "width",
    "height",
    "target_bitrate",
    "cpu_used",
    "max_quantizer",
)


def closed(value, keys):
    if type(value) is not dict or set(value) != set(keys):
        raise ValueError("invalid private peer message shape")
    return value


def text(value, limit):
    if type(value) is not str or not value or len(value.encode("utf-8")) > limit:
        raise ValueError("invalid private peer string")
    return value


def profile(value):
    closed(value, ("id", "fps", "bitrate_kbps"))
    if type(value["id"]) is not str or value["id"] not in PROFILE_ENCODERS:
        raise ValueError("unsupported peer profile")
    integer(value["fps"], 24, 60)
    integer(value["bitrate_kbps"], 500, 2500)
    return value


def ice_servers(value):
    if type(value) is not list or len(value) > 8:
        raise ValueError("bounded ICE servers required")
    for server in value:
        if (
            type(server) is not dict
            or not set(server) <= {"urls", "username", "credential"}
            or "urls" not in server
        ):
            raise ValueError("invalid ICE server")
        urls = [server["urls"]] if type(server["urls"]) is str else server["urls"]
        if type(urls) is not list or not 1 <= len(urls) <= 8:
            raise ValueError("bounded ICE URLs required")
        for url in urls:
            text(url, 2048)
            if not url.startswith(("stun:", "turn:", "turns:")):
                raise ValueError("unsupported ICE scheme")
        for key in ("username", "credential"):
            if key in server:
                text(server[key], 512)
    return value


def command_body(kind, body):
    if kind == "bootstrap":
        closed(body, ("profile", "ice_servers", "source"))
        profile(body["profile"])
        ice_servers(body["ice_servers"])
        if body["source"] not in ("production", "isolated_synthetic"):
            raise ValueError("unsupported peer source")
    elif kind == "offer":
        closed(body, ("sdp",))
        text(body["sdp"], 65536)
    elif kind == "ice":
        closed(body, ("index", "candidate"))
        integer(body["index"], 0, 65535)
        text(body["candidate"], 4096)
    elif kind == "shutdown":
        closed(body, ())
    else:
        raise ValueError("unsupported private peer command")
    return body


def event_body(kind, body):
    if kind == "ready":
        closed(body, ("live_authority", "mutation_available"))
        if (
            body["live_authority"] is not False
            or body["mutation_available"] is not False
        ):
            raise ValueError("private transport cannot authorize mutation")
    elif kind == "answer":
        closed(body, ("sdp",))
        text(body["sdp"], 65536)
    elif kind == "ice":
        command_body(kind, body)
    elif kind == "ack":
        closed(body, ("state",))
        if body["state"] not in ("queued", "forwarded"):
            raise ValueError("invalid ICE acknowledgement")
    elif kind == "snapshot":
        closed(body, ("read_start_ns", "read_end_ns", "state", *SNAPSHOT_COUNTERS))
        integer(body["read_start_ns"], 0, 2**53 - 1)
        integer(body["read_end_ns"], body["read_start_ns"], 2**53 - 1)
        if body["state"] not in ("ready", "playing", "unavailable"):
            raise ValueError("invalid peer media state")
        for key in SNAPSHOT_COUNTERS:
            if body[key] is not None:
                integer(body[key], 0, 2**53 - 1)
    elif kind == "closed":
        closed(body, ("teardown",))
        if body["teardown"] not in ("null_observed", "unknown"):
            raise ValueError("invalid peer teardown")
    elif kind == "error":
        closed(body, ("reason",))
        if body["reason"] not in (
            "bad_request",
            "setup_failed",
            "media_failed",
            "signaling_failed",
            "shutdown_failed",
            "pipe_lost",
        ):
            raise ValueError("invalid peer error")
    else:
        raise ValueError("unsupported private peer event")
    return body


def command(generation, sequence, kind, body):
    if type(generation) is not Generation:
        raise ValueError("typed peer generation required")
    value = {
        "version": VERSION,
        "generation": asdict(generation),
        "sequence": integer(sequence, 0, MAX_COMMANDS - 1),
        "kind": kind,
        "body": command_body(kind, body),
    }
    return dict(value, request_hash=digest(value))


def event(request, kind, body):
    return {
        "version": VERSION,
        "generation": request["generation"],
        "sequence": request["sequence"],
        "request_hash": request["request_hash"],
        "kind": kind,
        "body": event_body(kind, body),
    }


def validate(value, *, incoming_command=False):
    closed(value, ("version", "generation", "sequence", "request_hash", "kind", "body"))
    if value["version"] != VERSION:
        raise ValueError("unsupported private peer version")
    closed(value["generation"], ("owner", "pipeline", "peer"))
    Generation(**value["generation"])
    integer(value["sequence"], 0, MAX_COMMANDS - 1)
    if (
        type(value["request_hash"]) is not str
        or re.fullmatch(r"[a-f0-9]{64}", value["request_hash"]) is None
    ):
        raise ValueError("invalid private request hash")
    if incoming_command:
        command_body(value["kind"], value["body"])
        body = {k: v for k, v in value.items() if k != "request_hash"}
        if digest(body) != value["request_hash"]:
            raise ValueError("private peer command hash mismatch")
    else:
        event_body(value["kind"], value["body"])
    return value


def _unique(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate private peer JSON key")
        result[key] = value
    return result


def _constant(_):
    raise ValueError("nonfinite private peer JSON")


def decode(line, *, incoming_command=False):
    if type(line) is not bytes or len(line) > MAX_LINE:
        raise ValueError("private peer frame limit")
    try:
        value = json.loads(line, object_pairs_hook=_unique, parse_constant=_constant)
    except (RecursionError, UnicodeError):
        raise ValueError("invalid private peer JSON") from None
    return validate(value, incoming_command=incoming_command)


def encode(value):
    data = (
        json.dumps(
            value, sort_keys=True, separators=(",", ":"), allow_nan=False
        ).encode()
        + b"\n"
    )
    if len(data) > MAX_LINE:
        raise ValueError("private peer frame limit")
    return data


class Lines:
    def __init__(self):
        self.buffer = b""

    def feed(self, data, *, incoming_command=False):
        if len(self.buffer) + len(data) > MAX_BUFFER:
            raise ValueError("private peer buffer limit")
        self.buffer += data
        result = []
        for _ in range(32):
            if b"\n" not in self.buffer:
                break
            line, self.buffer = self.buffer.split(b"\n", 1)
            result.append(decode(line, incoming_command=incoming_command))
        if b"\n" not in self.buffer and len(self.buffer) > MAX_LINE:
            raise ValueError("private peer frame limit")
        return result
