"""Read-only OS CPU counters for an inventory from the freshly owned browser's CDP."""

import ctypes
import hashlib
import json
import os
import sys
import time
from pathlib import Path


class Usage(ctypes.Structure):
    _fields_ = [("uuid", ctypes.c_uint8 * 16)] + [
        (key, ctypes.c_uint64) for key in (
            "user", "system", "idle", "interrupt", "pageins", "wired", "resident",
            "footprint", "start", "exit",
        )
    ]


class ShortInfo(ctypes.Structure):
    _fields_ = [(k, ctypes.c_uint32) for k in ("pid", "ppid", "pgid", "status")]
    _fields_ += [("comm", ctypes.c_char * 16)]
    _fields_ += [(k, ctypes.c_uint32) for k in ("flags", "uid", "gid", "ruid", "rgid", "svuid", "svgid", "reserved")]


class Timebase(ctypes.Structure):
    _fields_ = [("numer", ctypes.c_uint32), ("denom", ctypes.c_uint32)]


def reader():
    if sys.platform == "darwin":
        lib = ctypes.CDLL("/usr/lib/libproc.dylib", use_errno=True)
        system = ctypes.CDLL("/usr/lib/libSystem.B.dylib")
        lib.proc_pid_rusage.argtypes = (ctypes.c_int, ctypes.c_int, ctypes.c_void_p)
        lib.proc_pidinfo.argtypes = (ctypes.c_int, ctypes.c_int, ctypes.c_uint64, ctypes.c_void_p, ctypes.c_int)
        system.mach_timebase_info.argtypes = (ctypes.POINTER(Timebase),)
        scale = Timebase()
        if system.mach_timebase_info(ctypes.byref(scale)) != 0 or not scale.numer or not scale.denom:
            raise ValueError("browser CPU timebase unavailable")

        def read(pid):
            owner, usage = ShortInfo(), Usage()
            if (lib.proc_pidinfo(pid, 13, 0, ctypes.byref(owner), ctypes.sizeof(owner)) != ctypes.sizeof(owner)
                    or owner.pid != pid or owner.uid != os.getuid()
                    or lib.proc_pid_rusage(pid, 0, ctypes.byref(usage)) != 0
                    or not usage.start or usage.exit):
                raise ValueError("owned live browser CPU counter unavailable")
            # rusage CPU values are Mach absolute ticks on Apple silicon, not ns.
            return usage.user + usage.system, str(usage.start), scale.numer, scale.denom * 10**9
        return "darwin_proc_pid_rusage_v0_mach_timebase_v1", read
    if sys.platform == "linux":
        hz = os.sysconf("SC_CLK_TCK")

        def read(pid):
            path = Path(f"/proc/{pid}/stat")
            if path.stat().st_uid != os.getuid():
                raise ValueError("foreign browser CPU counter")
            values = path.read_text().rsplit(")", 1)[1].split()
            if values[0] in ("Z", "X"):
                raise ValueError("browser process exited")
            return int(values[11]) + int(values[12]), values[19], 1, hz
        return "linux_proc_stat_ticks_v1", read
    raise ValueError("native browser CPU platform unsupported")


def sample(info, *, source=None):
    if type(info) is not list or not 1 <= len(info) <= 128:
        raise ValueError("bounded owned browser inventory required")
    ids = set()
    for row in info:
        if (type(row) is not dict or set(row) != {"id", "type"}
                or type(row["id"]) is not int or not 0 < row["id"] < 2**31
                or type(row["type"]) is not str or not 0 < len(row["type"]) <= 128
                or row["id"] in ids):
            raise ValueError("invalid owned browser inventory")
        ids.add(row["id"])
    method, read = source if source is not None else reader()
    start = time.monotonic_ns()
    counters = []
    for row in info:
        ticks, lifetime, numerator, denominator = read(row["id"])
        if (type(ticks) is not int or not 0 <= ticks < 2**64
                or type(lifetime) is not str or not lifetime.isdecimal() or len(lifetime) > 20
                or int(lifetime) <= 0 or type(numerator) is not int or type(denominator) is not int
                or not 0 < numerator <= 2**32 or not 0 < denominator <= 2**63 - 1):
            raise ValueError("invalid native browser CPU counter")
        identity = json.dumps([row["id"], row["type"], lifetime], separators=(",", ":"))
        counters.append(dict(identity_hash=hashlib.sha256(identity.encode()).hexdigest(),
                             cpu_ticks_decimal=str(ticks), seconds_numerator=numerator,
                             seconds_denominator=denominator,
                             cpu_seconds=ticks * numerator / denominator))
    duration = time.monotonic_ns() - start
    if not 0 <= duration <= 50000000:
        raise ValueError("browser CPU read bracket unavailable")
    counters.sort(key=lambda row: row["identity_hash"])
    inventory = json.dumps([row["identity_hash"] for row in counters], separators=(",", ":"))
    return dict(sampling_method=method, process_count=len(counters),
                inventory_hash=hashlib.sha256(inventory.encode()).hexdigest(),
                cpu_seconds=sum(row["cpu_seconds"] for row in counters),
                native_read_duration_ns=duration, process_counters=counters)


if __name__ == "__main__":
    try:
        if sys.argv[1:] != ["--owned-cdp-inventory"]:
            raise ValueError("explicit owned browser inventory required")
        raw = sys.stdin.buffer.read(16385)
        if len(raw) > 16384:
            raise ValueError("browser inventory size bound")
        print(json.dumps(sample(json.loads(raw)), allow_nan=False))
    except (OSError, ValueError, TypeError, KeyError, IndexError, OverflowError):
        raise SystemExit(1) from None
