"""Explicit single-peer fresh recording; control-thread only, never frame callbacks."""

import threading

from camera_trace import HostTraceRecording
from camera_trace_config import TraceConfig
from camera_trace_hooks import HostTraceBinding, install_host_trace

PHASES = ("healthy", "degraded", "probe", "recovery")


class PeerRecordingControl:
    def __init__(self, pipeline, binding, gst, config, factory=HostTraceRecording):
        if not isinstance(binding, HostTraceBinding) or not isinstance(
            config, TraceConfig
        ):
            raise ValueError(
                "existing opted-in binding and bounded configuration required"
            )
        with binding.lock:
            if binding.closed or getattr(binding, "control_owner", None) is not None:
                raise ValueError("binding is closed or already owned")
            binding.control_owner = self
        self.pipeline, self.binding, self.gst = pipeline, binding, gst
        self.config, self.factory = config, factory
        self.lock = threading.Lock()
        self.index = 0
        self.active_phase = None
        self.finished = []
        self.handoff = None
        self.closed = False
        self.barrier = None
        self.failed_bindings = []

    def _block_source(self):
        if self.barrier is not None:
            return
        element = self.pipeline.get_by_name("video_capture")
        pad = element.get_static_pad("src") if element is not None else None
        if pad is None:
            raise ValueError("capture admission pad unavailable")
        idle = threading.Event()

        def acknowledge(_pad, _info):
            idle.set()  # No filesystem/core work in this one control barrier callback.
            return self.gst.PadProbeReturn.OK

        number = pad.add_probe(self.gst.PadProbeType.IDLE, acknowledge)
        if not number:
            raise ValueError("source admission barrier unavailable")
        self.barrier = (pad, number)
        if not idle.wait(1.0):
            self._unblock_source()
            raise ValueError("source admission barrier timed out")

    def _unblock_source(self):
        if self.barrier is not None:
            pad, number = self.barrier
            pad.remove_probe(number)
            self.barrier = None

    def start_phase(self, phase):
        with self.lock:
            if (
                self.closed
                or self.active_phase is not None
                or self.index >= 4
                or phase != PHASES[self.index]
            ):
                raise ValueError("recordings require single-owner measured phase order")
            self._block_source()
            if self.handoff is None:
                self.handoff = self.binding.retire()
                # Initial warm-up collector stays separate and is never a measured phase.
                self.binding.recording.finish()
            recording = self.factory(self.config)
            try:
                binding = install_host_trace(
                    self.pipeline, recording, self.gst, self.handoff
                )
            except Exception as exc:
                failed = getattr(exc, "trace_binding", None)
                if failed is not None:
                    self.failed_bindings.append(failed)
                self.closed = True
                recording.finish("source_error")
                raise
            if binding is None:
                raise ValueError("fresh phase binding unavailable")
            with binding.lock:
                binding.control_owner = self
            self.binding = binding
            self.active_phase = phase
            self.handoff = None
            self._unblock_source()
            return recording

    def finish_phase(self, phase):
        with self.lock:
            if self.closed or phase != self.active_phase:
                raise ValueError("only the active measured recording can finish")
            self._block_source()
            self.handoff = self.binding.retire()
            self.binding.recording.finish()
            recording = self.binding.recording
            self.finished.append((phase, recording))
            self.active_phase = None
            self.index += 1
            if self.index == 4:
                self._unblock_source()
            return recording  # Frozen; export/snapshot is explicitly outside callbacks.

    def close(self, reason="shutdown"):
        with self.lock:
            self.closed = True
            success = True
            for binding in [self.binding, *self.failed_bindings]:
                try:
                    binding.close(reason)
                    binding.recording.finish(reason)
                    success = success and not binding.probes
                except Exception:
                    success = False
            self.active_phase = None
            try:
                self._unblock_source()
            except Exception:
                success = False
            return success and self.barrier is None

    def rearm(self):
        """Fresh warm-up binding after a fully restored run; never reuse measured frames."""
        with self.lock:
            if not self.closed or self.index != 4 or self.handoff is None or self.failed_bindings or self.binding.probes:
                raise ValueError("only a complete restored recorder can rearm")
            self._block_source()
            recording = self.factory(self.config)
            try:
                binding = install_host_trace(self.pipeline, recording, self.gst, self.handoff)
                if binding is None:
                    raise ValueError("fresh warm-up binding unavailable")
                return binding
            except BaseException:
                recording.finish("source_error")
                raise
            finally:
                self._unblock_source()
