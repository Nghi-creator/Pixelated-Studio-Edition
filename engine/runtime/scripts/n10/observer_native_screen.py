"""Contained read-only observer-cost sampling; clocks/PIDs never become live authority."""

import os
import time
from pathlib import Path


class NativeScreen:
    def __init__(self, service, scene, *, record_phase=False):
        self.service, self.scene = service, scene
        self.record_phase = record_phase
        self.identities, self.samples = {}, []
        self.started = self.next_at = None

    def process(self, label, child=None, *, parent=False):
        if child is not None and child.poll() is not None:
            raise ValueError("owned measurement process exited")
        pid = os.getppid() if parent else (os.getpid() if child is None else child.pid)
        fields = Path(f"/proc/{pid}/stat").read_text().rsplit(")", 1)[1].split()
        identity = (pid, fields[19])
        if self.identities.setdefault(label, identity) != identity:
            raise ValueError("measurement process lifetime changed")
        return {"cpu_ticks": int(fields[11]) + int(fields[12]), "rss_bytes": int(fields[21]) * os.sysconf("SC_PAGE_SIZE")}

    def sample(self):
        now = time.monotonic_ns()
        if self.next_at is not None and now < self.next_at:
            return False
        if self.started is None:
            self.started = now
        start = time.monotonic_ns()
        workers = {}
        for peer_id in ("first", "second"):
            slot = self.service.active.get(peer_id)
            if slot is None or slot.owner is None or slot.failure or slot.stop.is_set() or slot.done.is_set():
                raise ValueError("measurement worker unavailable")
            observation = slot.owner.last_observation
            if observation is None or not 0 <= time.monotonic_ns() - observation[1] <= 1500000000:
                raise ValueError("native measurement observation stale")
            body = observation[0]
            if not body or body["connection_state"] != "connected" or body["ice_connection_state"] not in ("connected", "completed"):
                raise ValueError("measurement connection unavailable")
            if any(body[k] != v for k, v in {"configured_fps": 30, "negotiated_fps": 30, "width": 640, "height": 480}.items()):
                raise ValueError("measurement profile/caps changed")
            workers[peer_id] = {**self.process(peer_id, slot.owner.child), "capture_buffers": body["capture_buffers"], "encoded_buffers": body["encoded_buffers"]}
        parent, relay, game = self.process("parent"), self.process("relay", parent=True), self.scene.resources()
        self.samples.append({"read_start_ns": start, "read_end_ns": time.monotonic_ns(), "parent": parent, "relay": relay, "workers": workers, "game": game, **({"game_phase": self.scene.phase()} if self.record_phase else {})})
        if len(self.samples) > 24:
            raise ValueError("native screen sample bound")
        self.next_at = now + 250000000
        return now - self.started >= 4500000000

    def report(self):
        return {"basis": "linux_monotonic_brackets_exact_owned_process_ticks", "ticks_per_second": os.sysconf("SC_CLK_TCK"), "samples": self.samples}
