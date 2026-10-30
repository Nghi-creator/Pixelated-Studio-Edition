"""Explicit presentation/script boundary for a separate moving-workload acquisition."""

import json
import time
from pathlib import Path

from live_probe_control.browser_game_worker import strict_object

METHOD = "n10-observer-moving-acquisition-v2"


class MovingObserverGate:
    method = METHOD

    def __init__(self, scene, emit, *, marker=Path("/acceptance/presented.json")):
        self.scene, self.emit, self.marker = scene, emit, marker
        self.origin = time.monotonic_ns()
        self.warmup = None
        self.phases = []
        self.window_started = False
        self.result = None

    def phase(self, label):
        value = {"label": label, "at_ns": time.monotonic_ns() - self.origin, **self.scene.phase()}
        self.phases.append(value)
        return value

    def tick(self, native_ready):
        if self.window_started:
            raise ValueError("moving window already started")
        now = time.monotonic_ns()
        if self.warmup is None:
            if now - self.origin > 8 * 10**9:
                raise ValueError("moving acquisition eligibility deadline")
            if not native_ready or now - self.scene.started < 3 * 10**9:
                return False
            try:
                with self.marker.open("rb") as source:
                    body = source.read(4097)
            except FileNotFoundError:
                return False
            if len(body) > 4096:
                raise ValueError("moving presentation marker size")
            value = json.loads(body, object_pairs_hook=strict_object)
            if value != {"method": self.method, "peers": ["first", "second"]}:
                raise ValueError("moving presentation marker mismatch")
            self.scene.arm_script()
            self.warmup = self.scene.script_started
            self.emit("moving_eligible", method=self.method, **self.phase("eligible"))
            return False
        if not native_ready:
            raise ValueError("moving readiness lost during fixed warmup")
        if now - self.warmup < 3 * 10**9:
            return False
        self.window_started = True
        self.emit("moving_window", method=self.method, **self.phase("window_start"))
        return True

    def report(self):
        if not self.window_started:
            raise ValueError("moving window not started")
        if self.result is None:
            self.phase("window_end")
            self.result = {"method": self.method, "basis": "camera_host_monotonic_no_browser_alignment",
                           "source_content_matched": False, "phases": list(self.phases)}
        return self.result
