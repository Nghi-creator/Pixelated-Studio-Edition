"""Persistent short engineering pressure, separate from the cadence probe setter."""
from contained_pressure import ContainedPressure, cgroup_counters
from paired_observation import PairedObservation


class ContentionObservation(PairedObservation):
    method = "n11-contained-contention-paired-v1"

    def __init__(self, *args):
        super().__init__(*args)
        self.pressure = ContainedPressure()
        self.pressure_stage, self.reference_rows = "healthy", []
        self.reference_sequence = self.pressure_sequence = None
        self.cleanup_emitted = False

    def stop_pressure(self):
        success = self.pressure.close()
        if not self.cleanup_emitted:
            self.emit("n11_pressure_cleanup", state="reaped" if success else "unknown",
                      at_ns=self.now()-self.origin, identities=self.pressure.identities(),
                      live_authority=False)
            self.cleanup_emitted = True
        if not success:
            raise ValueError("owned pressure cleanup unconfirmed")

    def checkpoint(self):
        try:
            self.stop_pressure()
        finally:
            super().checkpoint()

    def reference(self, now):
        slots = self.slots(("first",))
        if self.scene.game.poll() is not None:
            raise ValueError("pressure reference game exited")
        if slots is None or len(self.service.active) != 1 or not self.target_ready(slots, 30):
            if self.reference_rows:
                raise ValueError("native pressure reference lost")
            return False
        if not self.ready(slots, continuity=self.pressure_stage == "post"):
            return False
        identity = self.identity(slots)
        if self.identities is None: self.identities = identity
        if identity != self.identities:
            raise ValueError("pressure reference source changed")
        body, _, sequence = slots["first"].owner.last_observation
        if sequence == self.reference_sequence:
            return False
        self.reference_sequence = sequence
        row = dict(at_ns=now-self.origin, sequence=sequence, configured_fps=body["configured_fps"],
                   negotiated_fps=body["negotiated_fps"], capture_buffers=body["capture_buffers"],
                   encoded_buffers=body["encoded_buffers"], cgroup=cgroup_counters())
        self.reference_rows.append(row)
        if row["at_ns"]-self.reference_rows[0]["at_ns"] < 2000000000:
            return False
        self.emit("n11_pressure_reference", phase=self.pressure_stage, samples=self.reference_rows,
                  worker_identities=self.identities, live_authority=False)
        self.reference_rows = []
        return True

    def sample_pressure(self, phase, boundary=None):
        started = self.now()-self.origin
        sample = self.pressure.sample()
        ended = self.now()-self.origin
        self.emit("n11_pressure_sample", phase=phase, stage=self.stage, boundary=boundary,
                  at_ns=ended, read_start_ns=started, read_end_ns=ended, **sample)

    def phase_boundary(self, kind, phase):
        self.sample_pressure(phase, kind)

    def tick(self):
        now = self.now()
        if self.pressure_stage in ("healthy", "post"):
            if not self.reference(now):
                return False
            if self.pressure_stage == "post":
                self.pressure_stage = "done"
                return True
            started = self.pressure.start()
            self.emit("n11_pressure_started", at_ns=self.pressure.started_at-self.origin,
                      **started, live_authority=False)
            self.pressure_stage = "establish"
            return False
        if self.pressure_stage == "done":
            raise ValueError("contention acquisition already complete")
        self.pressure.alive()
        slots = self.slots(("first",))
        if slots is not None:
            sequence = slots["first"].owner.last_observation[2]
            if sequence != self.pressure_sequence:
                self.pressure_sequence = sequence
                self.sample_pressure(self.phase)
        if self.pressure_stage == "establish":
            if now-self.pressure.started_at >= 1000000000:
                self.pressure_stage = "pair"
            else:
                return False
        complete = super().tick()
        if complete:
            self.stop_pressure()
            self.pressure_stage, self.reference_sequence = "post", slots["first"].owner.last_observation[2]
        return False
