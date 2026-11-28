"""Retain the existing helper's exact durable active intent before phase admission."""

import hashlib
import json
import os
import stat
from copy import deepcopy

ERROR = "invalid_challenge_pressure_start"


def capture_pressure_start(pressure, result):
    if type(result) is not dict or set(result) != {
        "workers",
        "maximum_active_ns",
        "child_failsafe_ns",
        "identities",
        "intent_sha256",
        "allocation_cores",
    }:
        raise ValueError(ERROR)
    for key, expected in (
        ("workers", 2),
        ("maximum_active_ns", 20000000000),
        ("child_failsafe_ns", 40000000000),
        ("allocation_cores", 2),
    ):
        if type(result[key]) is not int or result[key] != expected:
            raise ValueError(ERROR)
    directory = os.open(pressure.directory.name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        fd = os.open("intent.json", os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=directory)
        with os.fdopen(fd, "rb") as stream:
            if not stat.S_ISREG(os.fstat(stream.fileno()).st_mode):
                raise ValueError(ERROR)
            raw = stream.read(8193)
        if not 0 < len(raw) <= 8192:
            raise ValueError(ERROR)
        expected = json.dumps(
            dict(version="n11-private-pressure-v1", state="active", workers=pressure.records),
            sort_keys=True,
        ).encode()
        if (
            raw != expected
            or hashlib.sha256(raw).hexdigest() != result["intent_sha256"]
            or result["identities"] != pressure.identities()
        ):
            raise ValueError(ERROR)
        return dict(start_result=deepcopy(result), intent_json=raw.decode("utf-8"))
    finally:
        os.close(directory)
