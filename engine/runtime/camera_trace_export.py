"""Standalone sanitized N4 gzip-TAR export, outside the frame path."""

import gzip
import hashlib
import io
import json
import os
import re
import stat
import tarfile
import uuid
from pathlib import Path

MAX_JSON_BYTES = 10 * 1024 * 1024
MAX_BUNDLE_BYTES = 32 * 1024 * 1024


def trace_bundle_bytes(recording, producer_version, provenance="producer_capture"):
    record = recording.snapshot(producer_version, provenance)
    if not record["streams"]:
        raise ValueError("N4 export requires a trace lifetime")
    payload = (
        json.dumps(record, indent=2, sort_keys=True, ensure_ascii=False, allow_nan=False) + "\n"
    ).encode("utf-8")
    if len(payload) > MAX_JSON_BYTES:
        raise ValueError("N4 trace JSON exceeds byte limit")
    manifest = {
        "schema_version": 1,
        "bundle_type": "pixelated_stage_trace",
        "trace_schema_version": "stage-trace-record-v1",
        "trace_sha256": hashlib.sha256(payload).hexdigest(),
        "trace_bytes": len(payload),
    }
    manifest_bytes = (json.dumps(manifest, indent=2, sort_keys=True) + "\n").encode("utf-8")
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode="w", format=tarfile.USTAR_FORMAT) as archive:
        for name, data in (("trace-manifest.json", manifest_bytes), ("trace-record.json", payload)):
            member = tarfile.TarInfo(name)
            member.size = len(data)
            member.mode = 0o600
            archive.addfile(member, io.BytesIO(data))
    raw = buffer.getvalue()
    if len(raw) > MAX_BUNDLE_BYTES:
        raise ValueError("N4 trace TAR exceeds byte limit")
    compressed = gzip.compress(raw, mtime=0)
    if len(compressed) > MAX_BUNDLE_BYTES:
        raise ValueError("N4 trace archive exceeds byte limit")
    return compressed


def write_trace_bundle(path, payload):
    path = Path(path).absolute()
    directory_flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
    parent = os.open(path.anchor, directory_flags)
    temporary = f".n4-{uuid.uuid4().hex}.tmp"
    created = False
    try:
        for component in path.parts[1:-1]:
            child = os.open(component, directory_flags, dir_fd=parent)
            os.close(parent)
            parent = child
        try:
            metadata = os.stat(path.name, dir_fd=parent, follow_symlinks=False)
        except FileNotFoundError:
            metadata = None
        if metadata is not None and not stat.S_ISREG(metadata.st_mode):
            raise ValueError("N4 export target must be regular")
        if not isinstance(payload, bytes) or len(payload) > MAX_BUNDLE_BYTES:
            raise ValueError("N4 export exceeds byte limit")
        fd = os.open(
            temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=parent
        )
        created = True
        try:
            with os.fdopen(fd, "wb", closefd=False) as target:
                target.write(payload)
                target.flush()
                os.fsync(target.fileno())
        finally:
            os.close(fd)
        os.replace(temporary, path.name, src_dir_fd=parent, dst_dir_fd=parent)
        created = False
    finally:
        try:
            if created:
                os.unlink(temporary, dir_fd=parent)
        finally:
            os.close(parent)


def export_camera_trace(recording, environment):
    # Disabled/unconfigured runs do not create a file or require a producer version.
    destination = environment.get("PIXELATED_STAGE_TRACE_OUTPUT")
    if recording is None or destination is None:
        return False
    try:
        version = environment.get("PIXELATED_STAGE_TRACE_PRODUCER_VERSION")
        if not isinstance(version, str) or re.fullmatch(r"[0-9a-f]{40}", version) is None:
            raise ValueError("N4 export requires a producer commit")
        payload = trace_bundle_bytes(recording, version)
        write_trace_bundle(destination, payload)
        return True
    except Exception:
        print("[N4] Stage trace export failed; no artifact published.")
        return False
