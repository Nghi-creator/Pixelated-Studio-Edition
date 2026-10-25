"""Private no-follow locked journal I/O, shared without action-specific semantics."""

import fcntl
import json
import os
import stat
import uuid
from contextlib import suppress


class PrivateJournal:
    def __init__(self, directory):
        self.directory = directory
        self.directory_fd = None
        self.fd = None
        self.journal = None

    def __enter__(self):
        try:
            self.directory_fd = os.open(
                self.directory, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
            )
            info = os.fstat(self.directory_fd)
            if info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != 0o700:
                raise ValueError("lease directory must be private and owned")
            self.fd = self._open("lease", os.O_RDWR | os.O_CREAT)
            fcntl.flock(self.fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            self.journal = self._read()
            return self
        except BaseException:
            self.__exit__(None, None, None)
            raise

    def _open(self, name, flags):
        fd = os.open(name, flags | os.O_NOFOLLOW | os.O_NONBLOCK, 0o600, dir_fd=self.directory_fd)
        info = os.fstat(fd)
        if (
            not stat.S_ISREG(info.st_mode)
            or info.st_nlink != 1
            or info.st_uid != os.getuid()
            or stat.S_IMODE(info.st_mode) != 0o600
        ):
            os.close(fd)
            raise ValueError("private regular lease file required")
        return fd

    def _write(self, value, name="journal.json"):
        if self.fd is None:
            raise ValueError("active lease required")
        # Recheck existing target; a symlink/special file is never read or followed.
        try:
            existing = self._open(name, os.O_RDONLY)
        except FileNotFoundError:
            existing = None
        if existing is not None:
            os.close(existing)
        temporary = "journal-" + uuid.uuid4().hex
        fd = self._open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL)
        try:
            data = (json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n").encode()
            with os.fdopen(fd, "wb") as file:
                file.write(data)
                file.flush()
                os.fsync(file.fileno())
            os.replace(
                temporary,
                name,
                src_dir_fd=self.directory_fd,
                dst_dir_fd=self.directory_fd,
            )
            os.fsync(self.directory_fd)
            if name == "journal.json":
                self.journal = value
        finally:
            with suppress(FileNotFoundError):
                os.unlink(temporary, dir_fd=self.directory_fd)

    def __exit__(self, *_ignored):
        if self.fd is not None:
            os.close(self.fd)
            self.fd = None
        if self.directory_fd is not None:
            os.close(self.directory_fd)
            self.directory_fd = None

    def _read(self):
        raise NotImplementedError
