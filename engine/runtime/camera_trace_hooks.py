"""Gst pad adapter. Disabled mode installs nothing; probes always preserve flow."""

import threading

LOCATIONS = (
    ("video_capture", "src", "capture_output"),
    ("pre_encoder_queue", "sink", "pre_encode_queue_enter"),
    ("pre_encoder_queue", "src", "pre_encode_queue_exit"),
    ("video_encoder", "sink", "encode_input"),
    ("video_encoder", "src", "encode_output"),
)


class HostTraceBinding:
    def __init__(self, recording, gst):
        self.lock = threading.Lock()
        self.recording = recording
        self.gst = gst
        self.probes = []
        self.stream = None
        self.segment_key = None
        self.pad_segments = {}
        self.used_segments = set()
        self.ready = False
        self.closed = False

    def _suspend(self, reason):
        self.recording.stop(self.stream, reason)
        self.stream = None
        self.segment_key = None

    def _segment(self, boundary, key):
        if type(key) is not int or not 0 <= key <= 2**32 - 1:
            self._suspend("source_error")
            return
        if boundary == "capture_output":
            if key in self.used_segments:
                self._suspend("source_error")
                return
            if self.segment_key is not None or self.stream is None:
                self.recording.stop(self.stream)
                self.stream = self.recording.begin()
            if self.stream is None:
                self.ready = False  # Sixteen-lifetime recording capacity exhausted.
                return
            self.used_segments.add(key)
            self.segment_key = key
        self.pad_segments[boundary] = key

    def callback(self, boundary):
        def probe(_pad, info):
            with self.lock:
                if not self.ready or self.closed:
                    return self.gst.PadProbeReturn.OK
                try:
                    if info.type & self.gst.PadProbeType.EVENT_DOWNSTREAM:
                        event = info.get_event()
                        if event.type == self.gst.EventType.SEGMENT:
                            self._segment(boundary, event.get_seqnum())
                        elif event.type == self.gst.EventType.FLUSH_START:
                            self.pad_segments.pop(boundary, None)
                            if boundary == "capture_output":
                                self._suspend("completed")
                        return self.gst.PadProbeReturn.OK
                    buffer = info.get_buffer()
                    if buffer is None or self.stream is None or self.segment_key is None:
                        return self.gst.PadProbeReturn.OK
                    if self.pad_segments.get(boundary) != self.segment_key:
                        return self.gst.PadProbeReturn.OK
                    if boundary == "capture_output":
                        if (
                            buffer.has_flags(self.gst.BufferFlags.DISCONT)
                            and self.stream.loss["offered_frames"]
                        ):
                            self._suspend("completed")
                        else:
                            self.recording.capture(self.stream, buffer.pts)
                    else:
                        self.recording.endpoint(self.stream, boundary, buffer.pts)
                except Exception:
                    # An optional instrumentation failure never drops a media buffer.
                    self._suspend("source_error")
                    self.ready = False
            return self.gst.PadProbeReturn.OK

        return probe

    def close(self, reason="shutdown"):
        with self.lock:
            self.closed = True
            self.recording.stop(self.stream, reason)
            self.stream = None
            probes, self.probes = self.probes, []
            self.pad_segments.clear()
            self.used_segments.clear()
        # Do not hold the binding mutex while asking Gst to remove callbacks.
        failed = []
        for pad, probe_id in probes:
            try:
                pad.remove_probe(probe_id)
            except Exception:
                failed.append((pad, probe_id))
        if failed:
            with self.lock:
                self.probes.extend(failed)  # A later close can retry; flow stays untouched.


def install_host_trace(pipeline, recording, gst):
    if recording is None:
        return None
    # Resolve the complete hook set before registration. Called before PLAYING.
    pads = []
    for element_name, pad_name, boundary in LOCATIONS:
        element = pipeline.get_by_name(element_name)
        pad = element.get_static_pad(pad_name) if element is not None else None
        if pad is None:
            raise ValueError("N4 host boundary is unavailable")
        pads.append((pad, boundary))
    binding = HostTraceBinding(recording, gst)
    try:
        for pad, boundary in pads:
            probe_id = pad.add_probe(
                gst.PadProbeType.BUFFER
                | gst.PadProbeType.EVENT_DOWNSTREAM
                | gst.PadProbeType.EVENT_FLUSH,
                binding.callback(boundary),
            )
            if not probe_id:
                raise ValueError("N4 host probe registration failed")
            binding.probes.append((pad, probe_id))
        binding.stream = recording.begin()
        if binding.stream is None:
            binding.close("capacity")
            return None
        binding.ready = True
        return binding
    except Exception:
        binding.close("source_error")
        raise


def install_trace_shutdown(recording, glib, loop):
    """Only opt-in tracing adds a graceful SIGTERM path through camera's finally."""
    if recording is None:
        return None
    import signal

    def shutdown(*_ignored):
        loop.quit()
        return False

    return glib.unix_signal_add(glib.PRIORITY_DEFAULT, signal.SIGTERM, shutdown)
