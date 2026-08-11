"""Atomic peer and encoder telemetry state for the camera bridge."""

import json
import os
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


def _element_queue_level(element):
    try:
        return max(0, int(element.get_property("current-level-buffers")))
    except Exception:
        return 0


def write_encoder_telemetry(file_path, session_id, peers):
    active_peers = list(peers.values())
    profiles = [peer.get("stream_profile") for peer in active_peers]
    profiles = [profile for profile in profiles if isinstance(profile, dict)]
    profile = profiles[0] if profiles else None
    queue_levels = []
    for peer in active_peers:
        for queue_name in ["pre_encoder_queue", "post_encoder_queue"]:
            queue = peer.get(queue_name)
            if queue is not None:
                queue_levels.append(_element_queue_level(queue))

    atomic_write_json(
        file_path,
        {
            "cpuUsed": profile.get("cpu_used") if profile else None,
            "framesDroppedTotal": sum(
                int(peer.get("frames_dropped_total", 0)) for peer in active_peers
            ),
            "framesInTotal": sum(
                int(peer.get("frames_in_total", 0)) for peer in active_peers
            ),
            "framesOutTotal": sum(
                int(peer.get("frames_out_total", 0)) for peer in active_peers
            ),
            "maxQuantizer": profile.get("max_quantizer") if profile else None,
            # A direct encoder processing duration is not exposed by this pipeline.
            "pipelineDelayProxyMs": None,
            "queueLevelBuffers": max(queue_levels) if queue_levels else 0,
            "schemaVersion": 1,
            "sessionId": session_id,
            "targetBitrateKbps": profile.get("bitrate_kbps") if profile else None,
            "targetFps": profile.get("fps") if profile else None,
            "updatedAt": _utc_timestamp(),
        },
    )
