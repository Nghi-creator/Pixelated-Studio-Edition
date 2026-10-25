"""Private N5 lease semantics; recovery never guesses foreign ownership."""

import json
import os
import re
from dataclasses import asdict

from private_journal import PrivateJournal

from .contracts import Resource


class RuntimeLease(PrivateJournal):
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
