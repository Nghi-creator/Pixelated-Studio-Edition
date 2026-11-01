"""Private atomic N5 output through pinned no-follow directories."""

import os
import stat
import uuid
from pathlib import Path

MAX_BUNDLE_BYTES = 64 * 1024 * 1024


def write_atomic(path, payload):
    path = Path(path).absolute()
    directory_flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
    parent = os.open(path.anchor, directory_flags)
    temporary = f".n5-{uuid.uuid4().hex}.tmp"
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
            raise ValueError("N5 export target must be regular")
        if not isinstance(payload, bytes) or len(payload) > MAX_BUNDLE_BYTES:
            raise ValueError("N5 export exceeds byte limit")
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
