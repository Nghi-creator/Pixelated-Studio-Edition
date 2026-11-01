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
        self.last_capture_pts = None
        self.pts_floor = None
        self.allow_initial_encoder_segment = False
        self.source_segment_description = None
        self.encoder_input_segment = None
        self.encoder_output_segment_seen = False

    def _suspend(self, reason):
        self.recording.stop(self.stream, reason)
        self.stream = None
        self.segment_key = None
        self.source_segment_description = None
        self.encoder_input_segment = None

    def _segment_description(self, event):
        parse = getattr(event, "parse_segment", None)
        if parse is None:
            return None
        segment = parse()
        if segment.format != self.gst.Format.TIME or segment.rate != 1 or segment.applied_rate != 1:
            return None
        values = tuple(getattr(segment, name) for name in (
            "base", "offset", "start", "stop", "time", "position", "duration"
        ))
        if any(type(value) is not int or not 0 <= value < 2**64 for value in values):
            return None
        return (int(segment.flags), *values)

    def _segment(self, boundary, key, description=None):
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
            self.pts_floor = None
            self.last_capture_pts = None
            self.source_segment_description = description
            self.encoder_input_segment = None
        if boundary == "encode_input" and key == self.segment_key:
            self.encoder_input_segment = (key, description)
        if (
            boundary == "encode_output"
            and key != self.segment_key
            and self.allow_initial_encoder_segment
            and not self.encoder_output_segment_seen
            and len(self.used_segments) == 1
            and description is not None
            and description == self.source_segment_description
            and self.encoder_input_segment == (self.segment_key, description)
        ):
            # A freshly NULL pipeline has no older encoded generation. GstVideoEncoder
            # may issue its own event ID for an unchanged initial TIME segment.
            # Normalize only that proven initial segment, never a seek/reset or PTS.
            key = self.segment_key
        if boundary == "encode_output":
            self.encoder_output_segment_seen = True
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
                            self._segment(boundary, event.get_seqnum(), self._segment_description(event))
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
                        if self.pts_floor is not None and (
                            type(buffer.pts) is not int or buffer.pts <= self.pts_floor
                        ):
                            return self.gst.PadProbeReturn.OK
                        if type(buffer.pts) is int and 0 <= buffer.pts < 2**64 - 1:
                            self.last_capture_pts = max(self.last_capture_pts or 0, buffer.pts)
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

        costs = getattr(self, "probe_costs", None)
        if costs is None:
            return probe
        def timed(pad, info):
            if not info.type & self.gst.PadProbeType.BUFFER:
                return probe(pad, info)
            import time
            start = time.perf_counter_ns()
            try:
                return probe(pad, info)
            finally:
                costs.observe(time.perf_counter_ns() - start)
        return timed

    def retire(self):
        """Freeze source admission boundary before closing; private PTS never exports."""
        with self.lock:
            if self.closed or self.segment_key is None or self.last_capture_pts is None:
                raise ValueError("active source admission boundary unavailable")
            handoff = (self.segment_key, dict(self.pad_segments),
                       set(self.used_segments), self.last_capture_pts)
            self.closed = True
        self.close("completed")
        if self.probes:
            raise ValueError("old probes could not be retired")
        return handoff

    def close(self, reason="shutdown"):
        with self.lock:
            self.closed = True
            self.recording.stop(self.stream, reason)
            self.stream = None
            probes, self.probes = self.probes, []
            self.pad_segments.clear()
            self.used_segments.clear()
            self.source_segment_description = None
            self.encoder_input_segment = None
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


def install_host_trace(pipeline, recording, gst, handoff=None, probe_costs=None):
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
    binding.probe_costs = probe_costs
    if handoff is None:
        try:
            _, state, pending = pipeline.get_state(0)
            binding.allow_initial_encoder_segment = state == gst.State.NULL and pending == gst.State.VOID_PENDING
        except (AttributeError, TypeError, ValueError):
            pass  # Unknown/playing pipelines retain the original strict sequence guard.
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
        if handoff is not None:
            binding.segment_key, binding.pad_segments, binding.used_segments, binding.pts_floor = handoff
            binding.last_capture_pts = binding.pts_floor
        binding.ready = True
        return binding
    except Exception as exc:
        binding.close("source_error")
        if binding.probes:
            exc.trace_binding = binding  # Retain exact handles for control cleanup retry.
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


class ProbeCosts:
    """Bounded explicit diagnostic only; samples contain durations, never raw buffers."""
    def __init__(self):
        self.samples = []
        self.count = 0
        self.lock = threading.Lock()

    def observe(self, duration):
        with self.lock:
            self.count += 1
            if len(self.samples) < 10000:
                self.samples.append(duration)

    def snapshot(self):
        with self.lock:
            return list(self.samples), self.count
