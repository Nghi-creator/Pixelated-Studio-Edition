"""Private descriptor-bound command files; exact-once names, bounded canonical JSON."""

import os
import re
import stat
import time
from concurrent.futures import ThreadPoolExecutor
from contextlib import suppress

from .peer import MAX_ACK_BYTES, MAX_COMMAND_BYTES, encode

STATE = "n11-challenge-state.json"
ERROR = "invalid_challenge_channel"


class OwnedDirectory:
    def __init__(self, path, identity=None):
        self.path = os.fspath(path)
        self.fd = os.open(self.path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        self.snapshot_identity = None
        try:
            info = os.fstat(self.fd)
            self.identity = info.st_dev, info.st_ino
            if (
                info.st_uid != os.getuid()
                or info.st_mode & 0o077
                or identity is not None
                and identity != self.identity
            ):
                raise ValueError(ERROR)
            self.check()
        except BaseException:
            os.close(self.fd)
            self.fd = None
            raise

    def check(self):
        if self.fd is None:
            raise ValueError(ERROR)
        info = os.stat(self.path, follow_symlinks=False)
        if (
            not stat.S_ISDIR(info.st_mode)
            or (info.st_dev, info.st_ino) != self.identity
            or info.st_uid != os.getuid()
            or info.st_mode & 0o077
        ):
            raise ValueError(ERROR)

    def _name(self, name):
        if (
            name != STATE
            and re.fullmatch(r"n11-challenge-(command|ack)-[0-9]{2}\.json", name) is None
        ):
            raise ValueError(ERROR)

    def read(self, name, limit):
        self.check()
        self._name(name)
        fd = os.open(name, os.O_RDONLY | os.O_NONBLOCK | os.O_NOFOLLOW, dir_fd=self.fd)
        try:
            info = os.fstat(fd)
            if (
                not stat.S_ISREG(info.st_mode)
                or info.st_uid != os.getuid()
                or info.st_mode & 0o077
                or not 0 < info.st_size <= limit
            ):
                raise ValueError(ERROR)
            with os.fdopen(fd, "rb", closefd=False) as stream:
                raw = stream.read(limit + 1)
            if len(raw) != info.st_size:
                raise ValueError(ERROR)
            self.check()
            return raw
        finally:
            os.close(fd)

    def write(self, name, raw, *, snapshot=False):
        self.check()
        self._name(name)
        if (
            type(raw) is not bytes
            or not 0 < len(raw) <= MAX_ACK_BYTES
            or snapshot != (name == STATE)
        ):
            raise ValueError(ERROR)
        if snapshot:
            try:
                info = os.stat(name, dir_fd=self.fd, follow_symlinks=False)
            except FileNotFoundError:
                if self.snapshot_identity is not None:
                    raise ValueError(ERROR) from None
            else:
                if self.snapshot_identity != (info.st_dev, info.st_ino) or not stat.S_ISREG(
                    info.st_mode
                ):
                    raise ValueError(ERROR)
        pending = ".pending-" + name
        fd = os.open(
            pending, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=self.fd
        )
        try:
            with os.fdopen(fd, "wb", closefd=False) as target:
                target.write(raw)
                target.flush()
                os.fsync(fd)
            self.check()
            if snapshot:
                os.replace(pending, name, src_dir_fd=self.fd, dst_dir_fd=self.fd)
            else:
                os.link(
                    pending, name, src_dir_fd=self.fd, dst_dir_fd=self.fd, follow_symlinks=False
                )
            if snapshot:
                info = os.stat(name, dir_fd=self.fd, follow_symlinks=False)
                self.snapshot_identity = info.st_dev, info.st_ino
        finally:
            os.close(fd)
            with suppress(FileNotFoundError):
                os.unlink(pending, dir_fd=self.fd)

    def close(self):
        if self.fd is not None:
            os.close(self.fd)
            self.fd = None


class ChallengeFileService:
    def __init__(self, endpoint, directory, *, clock=time.monotonic_ns, asynchronous=False):
        self.endpoint, self.directory, self.clock = endpoint, directory, clock
        if type(asynchronous) is not bool:
            raise ValueError(ERROR)
        self.executor = (
            ThreadPoolExecutor(max_workers=1, thread_name_prefix="physical-challenge")
            if asynchronous
            else None
        )
        self.pending = None
        self.report_sequence, self.next_report = 0, 0
        self.publish()

    def publish(self):
        self.report_sequence += 1
        self.directory.write(
            STATE,
            encode(dict(report_sequence=self.report_sequence, snapshot=self.endpoint.snapshot())),
            snapshot=True,
        )
        self.next_report = self.clock() + 100_000_000

    def poll(self):
        if self.pending is not None:
            if not self.pending.done():
                return  # Native PeerMedia.poll still runs; do not wait on lifecycle's lock.
            future, self.pending = self.pending, None
            self.acknowledge(future.result())
            return
        e = self.endpoint
        name = f"n11-challenge-command-{e.sequence + 1:02d}.json"
        raw = None
        if e.sequence < 32:
            with suppress(FileNotFoundError):
                raw = self.directory.read(name, MAX_COMMAND_BYTES)
        if raw is not None:
            if self.executor is not None:
                self.pending = self.executor.submit(e.execute, raw)
            else:
                self.acknowledge(e.execute(raw))
        elif self.clock() >= self.next_report:
            self.publish()

    def acknowledge(self, ack):
        self.directory.write(f"n11-challenge-ack-{ack['command_sequence']:02d}.json", encode(ack))
        self.publish()
        if ack["status"] != "completed":
            raise ValueError(ERROR)

    def close(self):
        if self.executor is not None:
            self.executor.shutdown(wait=False, cancel_futures=True)
