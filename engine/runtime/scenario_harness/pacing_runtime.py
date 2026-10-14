"""Owned opt-in pipeline pacing; a watchdog restores only the exact element."""

import threading

from .camera_runtime import LinuxCameraRuntime
from .contracts import SECOND, RunFailure


class CapturePacer:
    def __init__(self, element, owns, timer=threading.Timer):
        self.element, self.owns, self.timer_factory = element, owns, timer
        self.lock = threading.Lock()
        self.timer = None
        self.started = False
        self.expired = False
        self.failed = False

    def start(self, duration_ns):
        if type(duration_ns) is not int or not 40 * SECOND <= duration_ns <= 300 * SECOND:
            raise ValueError("bounded pacing watchdog required")
        with self.lock:
            if self.started or not self.owns() or self.element.get_property("sleep-time") != 0:
                raise ValueError("fresh exact pacing ownership required")
            self.started = True  # Cleanup retains attempted mutation even on setter failure.
            try:
                self.element.set_property("sleep-time", 50000)
                if self.element.get_property("sleep-time") != 50000:
                    raise ValueError("pacing setting did not apply")
                self.timer = self.timer_factory(duration_ns / SECOND, self._expire)
                self.timer.daemon = True
                self.timer.start()
            except BaseException:
                self.failed = True
                self._restore()
                raise

    def _restore(self):
        if not self.owns():
            self.failed = True
            return False
        value = self.element.get_property("sleep-time")
        if value not in (0, 50000):
            self.failed = True
            return False  # Never overwrite a foreign setting.
        if value == 50000:
            self.element.set_property("sleep-time", 0)
        success = self.element.get_property("sleep-time") == 0
        self.failed = self.failed or not success
        return success

    def _expire(self):
        with self.lock:
            self.expired = True
            try:
                self._restore()
            except BaseException:
                self.failed = True

    def stop(self):
        with self.lock:
            if self.timer is not None:
                self.timer.cancel()
            try:
                return self._restore()
            except BaseException:
                self.failed = True
                return False


class PacingCameraRuntime(LinuxCameraRuntime):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.pacer = None
        self.offset = None
        self.action_started_ns = self.action_stopped_ns = self.cleanup_ended_ns = None
        self.pacing_restored = False

    def preflight(self, plan, budget):
        available = super().preflight(plan, budget)
        if available.state != "available":
            return available
        try:
            element = self.pipeline.get_by_name("n5_capture_pacer")
            if (
                element is None
                or element.get_factory().get_name() != "identity"
                or element.get_property("sleep-time") != 0
                or element.get_property("drop-probability") != 0
                or element.get_property("sync")
            ):
                raise ValueError("explicit idle pacing element required")
            self.pacer = CapturePacer(
                element,
                lambda: (
                    self.camera.peers.get(self.peer_id) is self.peer
                    and self.peer["pipeline"] is self.pipeline
                    and self.pipeline.get_by_name("n5_capture_pacer") == element
                ),
            )
        except (ValueError, AttributeError, KeyError):
            from .camera_runtime import Availability

            self.availability = Availability("unavailable", "source_unavailable")
            self.plan = None
        return self.availability

    def start_recording(self, phase, budget):
        if phase == "degraded":
            self.action_started_ns = self.offset()
            self.pacer.start(sum(self.plan.durations_ns[2:4]) + 10 * SECOND)
        elif phase == "recovery":
            if not self.pacer.stop():
                raise RunFailure("cleanup_failed")
            self.action_stopped_ns = self.offset()
            self.cleanup_ended_ns = self.offset()
            self.pacing_restored = True
        super().start_recording(phase, budget)

    def counters(self):
        if self.pacer is not None and (self.pacer.expired or self.pacer.failed):
            raise RunFailure("action_failed")
        return super().counters()

    def restore(self, resource, budget):
        # Stop fault before closing any recorder, including aborted mid-phase runs.
        if self.pacer is not None and self.pacer.started:
            if not self.pacer.stop():
                return False
            self.pacing_restored = True
            if self.action_stopped_ns is None:
                try:
                    self.action_stopped_ns = self.offset()
                    self.cleanup_ended_ns = self.offset()
                except RunFailure:
                    pass  # Private cleanup success cannot invent a failed measurement clock.
        return super().restore(resource, budget)
