"""Exploratory same-worker, frozen-scene observer diagnostic. No acceptance authority."""

import hashlib
import os
import signal
import time

from observer_native_screen import NativeScreen


class ObserverStaticDiagnostic:
    labels = ("on-1", "off", "on-2")

    def __init__(self, service, scene, bridge, local, capability, emit, sio):
        self.service, self.scene, self.bridge = service, scene, bridge
        self.local, self.capability, self.emit, self.sio = local, capability, emit, sio
        self.origin = time.monotonic_ns()
        self.stage, self.index = "eligibility", 0
        self.marks, self.scopes = {}, {}
        self.frozen = self.closed = False
        self.game_fd = None
        self.sampler = None
        self.stage_start = self.origin
        self.identities = None
        self.sequence = None
        self.off_samples = None

    def mark(self, name, **values):
        if name not in self.marks:
            if len(self.marks) >= 32:
                raise ValueError("diagnostic timeline budget")
            self.marks[name] = {"at_ns": time.monotonic_ns() - self.origin, **values}

    def trace(self):
        return {"basis": "camera_host_detection_monotonic_relative_ns_no_browser_alignment", "marks": self.marks}

    def workers(self):
        values = {}
        for peer_id in ("first", "second"):
            slot = self.service.active.get(peer_id)
            if slot is None or slot.owner is None or slot.stop.is_set() or slot.done.is_set() or slot.failure:
                return None
            body = slot.owner.last_snapshot
            if body and body["encoded_buffers"] and body["connection_state"] == "connected":
                self.mark(peer_id + "_native_connected", capture_buffers=body["capture_buffers"], encoded_buffers=body["encoded_buffers"])
            else:
                return None
            values[peer_id] = slot
        return values

    def ready(self, slots):
        for peer_id, slot in slots.items():
            record = self.bridge.records.get(peer_id)
            if record is None or record.receiver_socket_id is None:
                return False
            self.mark(peer_id + "_bound")
            if peer_id not in self.scopes:
                self.scopes[peer_id] = self.bridge.attach(self.local, self.capability, peer_id, slot.token)
            if record.sample is not None:
                self.mark(peer_id + "_first_report", decoded=record.sample.frames_decoded,
                          presented=record.sample.presented_frames, sequence=record.sample.sequence)
        states = {peer: self.local.inspect(scope)["status"] for peer, scope in self.scopes.items()}
        for peer, status in states.items():
            if status == "ready_for_dry_run":
                self.mark(peer + "_ready")
        return len(states) == 2 and all(value == "ready_for_dry_run" for value in states.values())

    @staticmethod
    def identity(slots):
        return {peer: hashlib.sha256((slot.token + slot.sdp + repr(slot.owner.generation)).encode()).hexdigest()
                for peer, slot in slots.items()}

    @staticmethod
    def sequences(slots):
        return {peer: slot.owner.sequence for peer, slot in slots.items()}

    def begin(self, slots, now):
        current = self.identity(slots)
        if self.identities is None:
            self.identities = current
        if current != self.identities:
            raise ValueError("diagnostic worker lifetime/offer changed")
        self.sequence = self.sequences(slots)
        self.sampler = NativeScreen(self.service, self.scene)
        self.stage = "measure"
        self.stage_start = now
        self.emit("diagnostic_started", phase=self.labels[self.index])

    def tick(self):
        now = time.monotonic_ns()
        slots = self.workers()
        if slots is None:
            if self.stage != "eligibility":
                raise ValueError("diagnostic worker lost")
            if now - self.origin > 8 * 10**9:
                raise ValueError("diagnostic eligibility deadline")
            return False
        if self.stage == "eligibility":
            if now - self.origin > 8 * 10**9:
                raise ValueError("diagnostic eligibility deadline")
            if self.ready(slots):
                self.mark("eligible")
                self.stage, self.stage_start = "warmup", now
        elif self.stage == "warmup":
            if not self.ready(slots):
                raise ValueError("diagnostic readiness lost during fixed warmup")
            if now - self.stage_start >= 3 * 10**9:
                if self.scene.game.poll() is not None:
                    raise ValueError("owned diagnostic game exited")
                self.game_fd = os.pidfd_open(self.scene.game.pid)
                signal.pidfd_send_signal(self.game_fd, signal.SIGSTOP)
                self.frozen = True
                self.mark("game_frozen", game_age_ns=now - self.scene.started, script_actions=self.scene.sent)
                self.stage, self.stage_start = "settle", now
        elif self.stage == "settle":
            delay = 1000000000 if self.index == 2 else 500000000
            ready = self.ready(slots) if self.index == 2 else True
            if now - self.stage_start >= delay:
                if not ready:
                    raise ValueError("diagnostic fresh rebind readiness unavailable after settling")
                if self.index == 1:
                    self.off_samples = {peer: self.bridge.records[peer].sample for peer in slots}
                self.begin(slots, now)
        elif self.stage == "measure":
            if self.identity(slots) != self.identities or self.sequences(slots) != self.sequence:
                raise ValueError("diagnostic worker changed or received new private commands")
            if self.index == 1 and any(self.bridge.records[peer].sample != sample for peer, sample in self.off_samples.items()):
                raise ValueError("diagnostic off window still receiving browser reports")
            if self.sampler.sample():
                report = self.sampler.report()
                first, last = report["samples"][0], report["samples"][-1]
                if first["game"]["cpu_ticks"] != last["game"]["cpu_ticks"]:
                    raise ValueError("diagnostic frozen game still progressed")
                self.emit("diagnostic_native", phase=self.labels[self.index], worker_identities=self.identities,
                          private_sequences=self.sequence, game_frozen=True, **report)
                self.index += 1
                if self.index == 3:
                    self.emit("diagnostic_trace", **self.trace())
                    self.stage = "done"
                    return True
                if self.index == 1:
                    self.emit("diagnostic_observer_stop")
                else:
                    self.scopes.clear()
                    for peer in slots:
                        self.bridge.retire(peer)
                        self.sio.emit("webrtc-receiver-bind", self.bridge.open(peer))
                self.stage, self.stage_start = "settle", now
        return False

    def close(self):
        if self.closed:
            return
        self.closed = True
        try:
            if self.game_fd is not None:
                try:
                    signal.pidfd_send_signal(self.game_fd, signal.SIGCONT)
                except ProcessLookupError:
                    pass
        finally:
            if self.game_fd is not None:
                os.close(self.game_fd)
                self.game_fd = None
            self.frozen = False
