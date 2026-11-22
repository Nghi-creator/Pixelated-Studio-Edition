"""Ephemeral, owned two-worker pressure for one short contained engineering screen."""
import hashlib
import json
import os
import signal
import subprocess
import tempfile
import time
from pathlib import Path

from research.scenario_harness.camera_runtime import cpu_allocation
from research.scenario_harness.pressure import LinuxProcesses


class Deadline:
    def __init__(self, seconds):
        self.end = time.monotonic_ns() + int(seconds * 10**9)

    def check(self):
        remaining = self.end-time.monotonic_ns()
        if remaining <= 0:
            raise ValueError("pressure operation deadline")
        return remaining


def cgroup_counters():
    if Path("/proc/self/cgroup").read_text().strip() != "0::/" or cpu_allocation() != 2:
        raise ValueError("exact namespaced two-core cgroup required")
    rows = dict(line.split() for line in Path("/sys/fs/cgroup/cpu.stat").read_text().splitlines())
    result = {key: int(rows[key]) for key in ("nr_periods", "nr_throttled", "throttled_usec")}
    if any(v < 0 for v in result.values()):
        raise ValueError("invalid pressure cgroup counters")
    return result


class ContainedPressure:
    def __init__(self):
        self.processes = LinuxProcesses()
        self.children, self.handles, self.records = [], [], []
        self.started_at, self.closed, self.used = None, False, False
        self.directory = tempfile.TemporaryDirectory(prefix="n11-pressure-")
        self.previous_cpu = None

    def persist(self, state):
        directory = Path(self.directory.name)
        data = json.dumps(dict(version="n11-private-pressure-v1", state=state, workers=self.records), sort_keys=True).encode()
        temporary = directory / "intent.next"
        fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        try:
            with os.fdopen(fd, "wb") as stream:
                stream.write(data); stream.flush(); os.fsync(stream.fileno())
            os.replace(temporary, directory / "intent.json")
            fd = os.open(directory, os.O_RDONLY | os.O_DIRECTORY)
            try: os.fsync(fd)
            finally: os.close(fd)
        finally:
            temporary.unlink(missing_ok=True)
        return hashlib.sha256(data).hexdigest()

    def start(self):
        if self.used or self.closed:
            raise ValueError("pressure is single use")
        self.used = True
        cgroup_counters()
        budget = Deadline(2)
        for _ in range(2):
            child = self.processes.spawn(40000000000)  # Existing fixed isolated EOF/40s failsafe helper.
            self.children.append(child)
            handle = self.processes.pin(child.pid)
            self.handles.append(handle)
            self.processes.handshake(child, b"READY\n", budget)
            boot, start, _ = self.processes.identity(child.pid)
            self.records.append(dict(pid=child.pid, boot=boot, start=start))
        self.persist("parked")  # All exact child identities durable BEFORE any GO.
        self.started_at = time.monotonic_ns()
        for child in self.children:
            self.processes.activate(child)
            self.processes.handshake(child, b"ACTIVE\n", budget)
        intent_hash = self.persist("active")
        return dict(workers=2, maximum_active_ns=20000000000, child_failsafe_ns=40000000000,
                    identities=self.identities(), intent_sha256=intent_hash, allocation_cores=2)

    def identities(self):
        return [hashlib.sha256(json.dumps(r, sort_keys=True).encode()).hexdigest() for r in self.records]

    def alive(self):
        if self.closed or self.started_at is None or time.monotonic_ns()-self.started_at >= 20000000000:
            raise ValueError("pressure lifetime unavailable")
        if len(self.handles) != 2 or any(h is None or self.processes.exited(h) for h in self.handles):
            raise ValueError("pressure child exited")

    def sample(self):
        self.alive()
        cpu = []
        for child, record in zip(self.children, self.records, strict=True):
            boot, start, used = self.processes.identity(child.pid)
            if (boot, start) != (record["boot"], record["start"]):
                raise ValueError("pressure generation changed")
            cpu.append(used)
        if self.previous_cpu is not None and any(a < b for a,b in zip(cpu,self.previous_cpu,strict=True)):
            raise ValueError("pressure CPU counter reset")
        self.previous_cpu = cpu
        return dict(identities=self.identities(), active_workers=2, cpu_ns=cpu, cgroup=cgroup_counters())

    def close(self):
        if self.closed:
            return True
        success = True
        for index in reversed(range(len(self.children))):
            child = self.children[index]
            handle = self.handles[index] if index < len(self.handles) else None
            try:
                if handle is not None and not self.processes.exited(handle):
                    try: child.stdin.close()  # Trusted child checks EOF each bounded compute chunk.
                    except OSError: pass
                    try: child.wait(timeout=0.5)
                    except subprocess.TimeoutExpired: pass
                    if not self.processes.exited(handle):
                        self.processes.send(handle, signal.SIGTERM)
                        try: child.wait(timeout=0.25)
                        except subprocess.TimeoutExpired:
                            self.processes.send(handle, signal.SIGKILL)
                elif handle is None and child.poll() is None:
                    child.kill()  # Exact owned Popen before pinning failed; never a guessed PID.
                child.wait(timeout=1)
                if handle is not None and not self.processes.exited(handle):
                    raise ValueError("pressure reap unconfirmed")
                if child.stdin and not child.stdin.closed: child.stdin.close()
                if child.stdout: child.stdout.close()
            except Exception:
                success = False
            finally:
                try:
                    if handle is not None and self.processes.exited(handle):
                        self.processes.close(handle)
                        self.handles[index] = None
                except Exception:
                    success = False  # Still attempt cleanup of every other owned child.
        if success:
            try:
                self.persist("stopped")
                self.directory.cleanup()
            except Exception:
                return False
            self.closed = True
        return success
