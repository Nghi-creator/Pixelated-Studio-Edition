"""Linux pidfd ownership and durable parked-worker activation; no PID guesses."""

import ctypes
import os
import re
import select
import signal
import subprocess
import sys
import time
from pathlib import Path

from .contracts import SECOND, RunFailure, integer


class LinuxProcesses:
    """Small system boundary, replaceable by independent fake dependencies in tests."""

    def __init__(self):
        if (
            sys.platform != "linux"
            or not hasattr(os, "pidfd_open")
            or not hasattr(signal, "pidfd_send_signal")
        ):
            raise ValueError("Linux pidfd process ownership unavailable")
        self.boot = Path("/proc/sys/kernel/random/boot_id").read_text().strip()
        self.libc = ctypes.CDLL(None)
        self.libc.clock_getcpuclockid.argtypes = [ctypes.c_int, ctypes.POINTER(ctypes.c_int)]
        self.libc.clock_getcpuclockid.restype = ctypes.c_int

    def identity(self, pid):
        # comm may contain spaces/parentheses; fields after the last ')' are fixed.
        fields = Path(f"/proc/{pid}/stat").read_text().rsplit(")", 1)[1].split()
        clock = ctypes.c_int()
        error = self.libc.clock_getcpuclockid(pid, ctypes.byref(clock))
        if error:
            raise OSError(error, "owned process CPU clock unavailable")
        return self.boot, int(fields[19]), time.clock_gettime_ns(clock.value)

    def spawn(self, duration):
        # Fixed isolated helper path and validated integer duration; no shell/user command.
        integer(duration, 40 * SECOND, 300 * SECOND)
        return subprocess.Popen(  # noqa: S603
            [
                sys.executable,
                "-I",
                str(Path(__file__).with_name("pressure_child.py")),
                str(duration),
            ],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            close_fds=True,
            start_new_session=True,
        )

    def pin(self, pid):
        return os.pidfd_open(pid)

    def close(self, fd):
        os.close(fd)

    def exited(self, fd):
        return bool(select.select([fd], [], [], 0)[0])

    def send(self, fd, sig):
        signal.pidfd_send_signal(fd, sig)

    def handshake(self, child, expected, budget):
        data = b""
        while not data.endswith(b"\n") and len(data) < 16:
            remaining = budget.check()
            if not remaining:
                raise RunFailure("timeout")
            if select.select([child.stdout], [], [], min(remaining / SECOND, 0.02))[0]:
                chunk = os.read(child.stdout.fileno(), 1)
                if not chunk:
                    raise RunFailure("action_failed")
                data += chunk
        if data != expected:
            raise RunFailure("action_failed")

    def activate(self, child):
        child.stdin.write(b"GO\n")
        child.stdin.flush()

    def pause(self, budget):
        remaining = budget.check()
        if not remaining:
            raise RunFailure("timeout")
        time.sleep(min(remaining / SECOND, 0.01))

    def reap(self, child, budget):
        if child is not None:
            child.wait(timeout=max(0.001, min(budget.check() / SECOND, 0.1)))
            child.stdin.close()
            child.stdout.close()


class PressureWorkers:
    def __init__(self, lease, resources, processes=None):
        self.lease = lease
        self.resources = tuple(r for r in resources if r.kind == "pressure")
        self.processes = processes if processes is not None else LinuxProcesses()
        self.children = {}
        self.handles = {}
        self.records = {}
        self.cpu = {}
        self.completed = set()

    def _record(self, resource):
        value = self.lease.worker_record(resource)
        if value is None:
            return None
        if (
            type(value) is not dict
            or set(value) != {"version", "token", "generation", "pid", "boot", "start", "state"}
            or value["version"] != "n5-private-worker-v1"
            or value["token"] != resource.token
            or value["generation"] != resource.generation
            or value["state"] not in ("parked", "active", "stopped")
            or not isinstance(value["boot"], str)
            or not re.fullmatch(r"[0-9a-f-]{36}", value["boot"])
        ):
            raise ValueError("exact durable worker identity required")
        integer(value["pid"], 1, 2**31 - 1)
        integer(value["start"], 1)
        return value

    def _save(self, resource, value):
        self.lease.worker_record(resource, value)
        self.records[resource.token] = value

    def _pin(self, resource, record):
        token = resource.token
        fd = self.handles.get(token)
        if fd is None:
            try:
                fd = self.processes.pin(record["pid"])
            except ProcessLookupError:
                return None
            # Pin first, then verify /proc generation; a reuse cannot redirect signals.
            self.handles[token] = fd
        if self.processes.exited(fd):
            return fd
        boot, start, _ = self.processes.identity(record["pid"])
        if (boot, start) != (record["boot"], record["start"]):
            self.processes.close(fd)
            self.handles.pop(token, None)
            raise ValueError("worker generation changed")
        return fd

    def start(self, duration, budget):
        integer(duration, 40 * SECOND, 300 * SECOND)
        for resource in self.resources:
            budget.check()
            if self._record(resource) is not None:
                raise ValueError("worker activation is single-use")
            child = self.processes.spawn(duration)
            # Keep exact child handle before any operation that can fail.
            self.children[resource.token] = child
            self.handles[resource.token] = self.processes.pin(child.pid)
            self.processes.handshake(child, b"READY\n", budget)
            boot, start, cpu = self.processes.identity(child.pid)
            record = dict(
                version="n5-private-worker-v1",
                token=resource.token,
                generation=resource.generation,
                pid=child.pid,
                boot=boot,
                start=start,
                state="parked",
            )
            self._save(resource, record)  # fsync before any CPU activation.
            self.cpu[resource.token] = cpu
        # Activate only after all children are durably owned.
        for resource in self.resources:
            budget.check()
            child = self.children[resource.token]
            self.processes.activate(child)
            self.processes.handshake(child, b"ACTIVE\n", budget)
            self._save(resource, dict(self.records[resource.token], state="active"))
        budget.check()
        return True

    def owns(self, resource):
        if resource not in self.resources:
            return False
        record = self._record(resource)
        if record is None or record["state"] == "stopped":
            return True
        self._pin(resource, record)
        # An exited exact child is still ours to reap; counters reject its exit.
        return True

    def counters(self):
        active = 0
        for resource in self.resources:
            record = self._record(resource)
            if record is None:
                continue
            if record["state"] == "stopped":
                if resource.token not in self.completed:
                    fd = self._pin(resource, record)
                    if fd is not None and not self.processes.exited(fd):
                        raise RunFailure("action_failed")
                continue
            fd = self._pin(resource, record)
            if fd is None or self.processes.exited(fd) or record["state"] != "active":
                raise RunFailure("action_failed")
            _, _, cpu = self.processes.identity(record["pid"])
            if cpu < self.cpu.get(resource.token, 0):
                raise RunFailure("action_failed")
            self.cpu[resource.token] = cpu
            active += 1
        return active, sum(self.cpu.values())

    def restore(self, resource, budget):
        if resource not in self.resources:
            return False
        record = self._record(resource)
        child = self.children.get(resource.token)
        if record is not None and record["state"] == "stopped" and resource.token in self.completed:
            return True
        if record is None and child is None:
            return True  # No durable activation: crash orphan stayed parked, then EOF/5s.
        if record is None:
            # Failure before persistence: only this owner's exact child pidfd is usable.
            fd = self.handles.get(resource.token)
            if fd is None:
                fd = self.processes.pin(child.pid)
                self.handles[resource.token] = fd
        else:
            fd = self._pin(resource, record)
        try:
            if fd is not None and not self.processes.exited(fd):
                budget.check()
                self.processes.send(fd, signal.SIGTERM)
                # Reserve the caller's remaining time for escalation and reap.
                term_end = budget.timeline.now() + min(SECOND, budget.check() // 2)
                while not self.processes.exited(fd) and budget.timeline.now() < term_end:
                    self.processes.pause(budget)
                if not self.processes.exited(fd):
                    budget.check()
                    self.processes.send(fd, signal.SIGKILL)
                while not self.processes.exited(fd):
                    self.processes.pause(budget)
            self.processes.reap(child, budget)
            budget.check()
            if record is not None:
                self._save(resource, dict(record, state="stopped"))
            self.completed.add(resource.token)
            return True
        finally:
            # Keep handles on failure for retry; close only after proven stop.
            if fd is not None and self.processes.exited(fd):
                self.processes.close(fd)
                self.handles.pop(resource.token, None)

    def stop(self, budget):
        success = True
        for resource in reversed(self.resources):
            try:
                success = self.restore(resource, budget) and success
            except Exception:
                success = False
        return success
