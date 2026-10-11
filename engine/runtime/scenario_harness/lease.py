"""Private no-follow lease/journal. Recovery never guesses foreign ownership."""

import fcntl
import json
import os
import re
import stat
import uuid
from contextlib import suppress
from dataclasses import asdict

from .contracts import Resource


class RuntimeLease:
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
        fd = os.open(name, flags | os.O_NOFOLLOW, 0o600, dir_fd=self.directory_fd)
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

    def _read(self):
        try:
            fd = self._open("journal.json", os.O_RDONLY)
        except FileNotFoundError:
            return None
        try:
            data = os.read(fd, 65537)
            if len(data) > 65536:
                raise ValueError("ownership journal exceeds bound")
            value = json.loads(data, object_pairs_hook=_unique)
            if not isinstance(value, dict) or set(value) != {
                "version",
                "run_id",
                "state",
                "resources",
            }:
                raise ValueError("invalid ownership journal")
            if value["version"] != "n5-private-lease-v1" or value["state"] not in (
                "active",
                "dirty",
                "clean",
            ):
                raise ValueError("invalid ownership journal version/state")
            if (
                not isinstance(value["run_id"], str)
                or not re.fullmatch(r"run-[1-9][0-9]{0,9}", value["run_id"])
                or int(value["run_id"][4:]) > 2**31 - 1
            ):
                raise ValueError("invalid private run identity")
            resources = value["resources"]
            if not isinstance(resources, list) or not 1 <= len(resources) <= 10:
                raise ValueError("invalid ownership inventory")
            parsed = tuple(Resource(**item) for item in resources)
            if len({r.token for r in parsed}) != len(parsed):
                raise ValueError("duplicate ownership token")
            return value
        finally:
            os.close(fd)

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

    def worker_record(self, resource, value=None):
        """Private durable child identity, reachable only under matching active intent."""
        if (
            self.fd is None
            or self.journal is None
            or self.journal["state"] == "clean"
            or asdict(resource) not in self.journal["resources"]
            or resource.kind != "pressure"
        ):
            raise ValueError("exact active pressure ownership required")
        name = "worker-" + resource.token + ".json"
        if value is not None:
            self._write(value, name)
            return value
        try:
            fd = self._open(name, os.O_RDONLY)
        except FileNotFoundError:
            return None
        try:
            data = os.read(fd, 4097)
            if len(data) > 4096:
                raise ValueError("worker identity exceeds bound")
            return json.loads(data, object_pairs_hook=_unique)
        finally:
            os.close(fd)

    def begin(self, plan, resources):
        if self.journal is not None and self.journal["state"] != "clean":
            raise ValueError("unrestored journal requires explicit ownership recovery")
        if (
            not isinstance(resources, tuple)
            or not 1 <= len(resources) <= 10
            or any(not isinstance(r, Resource) for r in resources)
        ):
            raise ValueError("bounded prepared ownership inventory required")
        resources = tuple(Resource(**asdict(resource)) for resource in resources)
        if len({r.token for r in resources}) != len(resources):
            raise ValueError("duplicate ownership token")
        if self.journal is not None:
            # Retain at most one run's bounded native identities. Never scan/delete
            # other files or discard dirty ownership intent.
            for prior in self.journal["resources"]:
                if prior["kind"] != "pressure":
                    continue
                name = "worker-" + prior["token"] + ".json"
                try:
                    fd = self._open(name, os.O_RDONLY)
                except FileNotFoundError:
                    continue
                os.close(fd)
                os.unlink(name, dir_fd=self.directory_fd)
        self._write(
            {
                "version": "n5-private-lease-v1",
                "run_id": plan.run_id,
                "state": "active",
                "resources": [asdict(r) for r in resources],
            }
        )

    def finish(self, restored):
        if self.journal is None:
            raise ValueError("no owned run")
        value = dict(self.journal, state="clean" if restored else "dirty")
        self._write(value)

    def recover(self, runtime, budget):
        if self.journal is None or self.journal["state"] == "clean":
            return True
        resources = tuple(Resource(**item) for item in self.journal["resources"])
        restored, _reason = restore_owned(resources, runtime, budget)
        self.finish(restored)
        return restored

    def __exit__(self, *_ignored):
        if self.fd is not None:
            os.close(self.fd)
            self.fd = None
        if self.directory_fd is not None:
            os.close(self.directory_fd)
            self.directory_fd = None


def _unique(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate journal key")
        result[key] = value
    return result


def restore_owned(resources, runtime, budget):
    """Reverse acquisition order; retain failure and attempt other owned resources."""
    reason = None
    for resource in reversed(resources):
        try:
            budget.check()
            if runtime.owns(resource) is not True:
                reason = "ownership_lost"
                continue
            if runtime.restore(resource, budget) is not True:
                reason = reason or "restore_failed"
            budget.check()
        except BaseException:
            reason = reason or "restore_failed"
    return reason is None, reason
