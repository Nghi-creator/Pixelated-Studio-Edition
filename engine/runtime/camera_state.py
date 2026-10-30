"""Atomic peer and encoder telemetry state for the camera bridge."""

import json
import os
import time
from datetime import datetime, timezone


def atomic_write_json(file_path, payload):
    temporary_path = f"{file_path}.{os.getpid()}.tmp"
    try:
        with open(temporary_path, "w", encoding="utf-8") as state_file:
            json.dump(payload, state_file, separators=(",", ":"))
            state_file.flush()
            os.fsync(state_file.fileno())
        os.replace(temporary_path, file_path)
    except Exception as exc:
        try:
            os.unlink(temporary_path)
        except Exception:
            pass
        print(f"[Python] Failed to write state file {file_path}: {exc}")


def write_peer_state(file_path, session_id, peers):
    atomic_write_json(
        file_path,
        {
            "peerCount": len(peers),
            "peerIds": sorted(peers.keys()),
            "sessionId": session_id,
        },
    )


def _utc_timestamp():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _counter(value):
    return value if type(value) is int and 0 <= value <= 2**53 - 1 else None


def _element_queue_level(element):
    try:
        return _counter(element.get_property("current-level-buffers"))
    except (AttributeError, TypeError, ValueError):
        return None


def _peer_metrics(peer, now):
    if peer.get("worker_token") is not None:
        received = peer.get("worker_snapshot_received_ns")
        snapshot = peer.get("worker_snapshot")
        if (
            type(received) is not int
            or received > now
            or now - received > 2000000000
            or not isinstance(snapshot, dict)
            or snapshot.get("state") not in ("ready", "playing")
        ):
            snapshot = {}

        def native(key):
            return _counter(snapshot.get(key))

        bitrate = native("target_bitrate")
        return {
            "framesDroppedTotal": native("queue_overruns_total"),
            "framesInTotal": native("capture_buffers"),
            "framesOutTotal": native("encoded_buffers"),
            "queueLevelBuffers": _aggregate(
                [native("pre_encoder_queue_level"), native("post_encoder_queue_level")],
                max,
            ),
            "cpuUsed": native("cpu_used"),
            "maxQuantizer": native("max_quantizer"),
            "targetBitrateKbps": bitrate / 1000 if bitrate is not None else None,
            "targetFps": native("configured_fps"),
        }
    profile = peer.get("stream_profile") or {}
    return {
        "framesDroppedTotal": _counter(peer.get("frames_dropped_total")),
        "framesInTotal": _counter(peer.get("frames_in_total")),
        "framesOutTotal": _counter(peer.get("frames_out_total")),
        "queueLevelBuffers": _aggregate(
            [
                _element_queue_level(peer.get(name))
                for name in ("pre_encoder_queue", "post_encoder_queue")
            ],
            max,
        ),
        "cpuUsed": _counter(profile.get("cpu_used")),
        "maxQuantizer": _counter(profile.get("max_quantizer")),
        "targetBitrateKbps": _counter(profile.get("bitrate_kbps")),
        "targetFps": _counter(profile.get("fps")),
    }


def _aggregate(values, operation):
    if not values or any(value is None for value in values):
        return None
    result = operation(values)
    return result if 0 <= result <= 2**53 - 1 else None


def _same(values):
    return values[0] if values and all(v == values[0] for v in values) else None


def write_encoder_telemetry(file_path, session_id, peers):
    # Use parent receipt time only for freshness. Child read brackets never enter
    # the parent's trace clock or aggregate state format.
    now = time.monotonic_ns()
    metrics = [_peer_metrics(peer, now) for peer in list(peers.values())]
    payload = {
        "pipelineDelayProxyMs": None,
        "schemaVersion": 1,
        "sessionId": session_id,
        "updatedAt": _utc_timestamp(),
    }
    for key in ("framesDroppedTotal", "framesInTotal", "framesOutTotal"):
        payload[key] = _aggregate([m[key] for m in metrics], sum) if metrics else 0
    payload["queueLevelBuffers"] = (
        _aggregate([m["queueLevelBuffers"] for m in metrics], max) if metrics else 0
    )
    for key in ("cpuUsed", "maxQuantizer", "targetBitrateKbps", "targetFps"):
        payload[key] = _same([m[key] for m in metrics])
    atomic_write_json(file_path, payload)
