"""Reusable declarations and native/Gst fakes; no test cases or live pressure run."""

import signal
import sys
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from scenario_harness import (
    RunPlan,
)
from scenario_harness.contracts import (
    PHASES,
    SECOND,
    Execution,
    PhaseExecution,
    RunFailure,
)


def plan(workers=1):
    return RunPlan(
        "run-1", "host_contention" if workers else "healthy", 7, (30 * SECOND,) * 6, workers
    )


def execution(healthy=900, degraded=720, recovery=900, cpu=18 * SECOND, workers=1):
    # Independently specified Step 2 totals, apportioned without rounded FPS inputs.
    phases = []
    cursor = 0
    frames = 0
    for phase in PHASES:
        count = {"healthy": healthy, "degraded": degraded, "recovery": recovery}.get(phase, 900)
        active = workers if phase in ("degraded", "probe") else 0
        owned = cpu if active else 0
        rows = tuple(
            (
                cursor + i * SECOND,
                cursor + (i + 1) * SECOND,
                frames + count * i // 30,
                frames + count * (i + 1) // 30,
                active,
                owned * (i + 1) // 30 - owned * i // 30,
            )
            for i in range(30)
        )
        phases.append(PhaseExecution(phase, cursor, cursor + 30 * SECOND, "complete", None, rows))
        cursor += 30 * SECOND
        frames += count
    return Execution(
        "completed",
        None,
        tuple(phases),
        60 * SECOND if workers else None,
        120 * SECOND if workers else None,
        120 * SECOND if workers else None,
        120 * SECOND if workers else None,
        "restored",
        None,
        180 * SECOND,
        180 * SECOND,
        (),
    )


class Clock:
    value = 0

    def __call__(self):
        return self.value


class Processes:
    def __init__(self):
        self.next = 100
        self.live = {}
        self.signals = []
        self.reaped = []
        self.closed = []
        self.fail_handshake = None
        self.ignore_term = False
        self.ignore_kill = False
        self.activation_check = lambda: None

    def spawn(self, duration):
        self.next += 1
        self.live[self.next] = dict(
            boot="0" * 8 + "-" + "0" * 4 + "-" + "0" * 4 + "-" + "0" * 4 + "-" + "0" * 12,
            start=self.next,
            cpu=0,
            exited=False,
        )
        return SimpleNamespace(pid=self.next)

    def pin(self, pid):
        if pid not in self.live:
            raise ProcessLookupError()
        return pid

    def identity(self, pid):
        value = self.live[pid]
        return value["boot"], value["start"], value["cpu"]

    def exited(self, fd):
        return self.live[fd]["exited"]

    def handshake(self, child, expected, budget):
        budget.check()
        if child.pid == self.fail_handshake:
            raise RunFailure("action_failed")

    def activate(self, child):
        self.activation_check()

    def send(self, fd, sig):
        self.signals.append((fd, sig))
        if (sig == signal.SIGTERM and not self.ignore_term) or (
            sig == signal.SIGKILL and not self.ignore_kill
        ):
            self.live[fd]["exited"] = True

    def pause(self, budget):
        budget.check()
        budget.timeline.clock.value += SECOND // 10

    def reap(self, child, budget):
        budget.check()
        if child is not None:
            self.reaped.append(child.pid)

    def close(self, fd):
        self.closed.append(fd)


class Element:
    def __init__(self, name, properties=None):
        self.name = name
        self.properties = properties or {}

    def get_factory(self):
        return SimpleNamespace(get_name=lambda: self.name)

    def get_property(self, name):
        return self.properties.get(name, 1)

    def get_static_pad(self, name):
        return SimpleNamespace(
            get_current_caps=lambda: SimpleNamespace(
                get_structure=lambda index: SimpleNamespace(
                    get_fraction=lambda field: (True, 30, 1),
                    get_value=lambda field: {"width": 1280, "height": 720}[field],
                )
            )
        )
