"""Bounded host trace collection. No I/O, GI or research-core import in callbacks."""

import copy
import math
import re
import threading
import time

from camera_trace_config import BOUNDARIES, ENGINE_EVENTS, LOSS_FIELDS, SAFE_MAX, TraceConfig


class TraceStream:
    """Mutable collector state, only accessed under the recording's short mutex."""

    def __init__(self, number, config, origin, resolution):
        self.number = number
        self.config = config
        self.origin = origin
        self.last_clock = origin
        self.resolution = resolution
        self.frames = []
        self.events = []
        self.pts_frames = {}
        self.highest_pts = -1
        self.seen_endpoints = set()
        self.loss = dict.fromkeys(LOSS_FIELDS, 0)
        self.active = True
        self.stop_reason = "completed"

    def data(self):
        return {
            "stream_id": f"stream-{self.number}",
            "epoch_id": f"epoch-{self.number}",
            "clock_id": f"clock-{self.number}",
            "clock": {
                "source": "python_monotonic_ns",
                "unit": "ns",
                "origin": "stream_start",
                "resolution_ns": self.resolution,
                "synchronization": "none",
            },
            "capabilities": [
                {
                    "boundary": b,
                    "state": "supported" if b in ENGINE_EVENTS else "unavailable",
                    "reason": None if b in ENGINE_EVENTS else "unsupported_source",
                }
                for b in BOUNDARIES
            ],
            "sampling": {"every_nth_frame": self.config.every_nth_frame},
            "limits": {"max_frames": self.config.max_frames, "max_events": self.config.max_events},
            "deadline": None
            if self.config.budget_ns is None
            else {
                "method_id": "capture-output-budget",
                "method_version": 1,
                "budget_ns": self.config.budget_ns,
            },
            "frames": self.frames,
            "events": self.events,
            "loss": self.loss,
            "stop_reason": self.stop_reason,
        }


class HostTraceRecording:
    """One bounded recording across at most sixteen independent pipeline lifetimes."""

    def __init__(self, config, clock=time.monotonic_ns, resolution_ns=None):
        if not isinstance(config, TraceConfig):
            raise ValueError("approved trace configuration required")
        self.config = config
        self.clock = clock
        self.resolution = (
            resolution_ns
            if resolution_ns is not None
            else max(1, math.ceil(time.get_clock_info("monotonic").resolution * 1e9))
        )
        if type(self.resolution) is not int or not 1 <= self.resolution <= SAFE_MAX:
            raise ValueError("invalid monotonic resolution")
        self.lock = threading.Lock()
        self.streams = []
        self.frame_slots = 0
        self.event_slots = 0
        self.finished = False

    def begin(self):
        with self.lock:
            if self.finished or len(self.streams) >= 16:
                return None
            origin = self.clock()
            if type(origin) is not int or origin < 0:
                raise ValueError("invalid monotonic origin")
            stream = TraceStream(len(self.streams) + 1, self.config, origin, self.resolution)
            self.streams.append(stream)
            return stream

    def stop(self, stream, reason="completed"):
        if reason not in ("completed", "capacity", "shutdown", "source_error"):
            raise ValueError("invalid trace stop reason")
        if stream is None:
            return
        with self.lock:
            if stream not in self.streams:
                raise ValueError("foreign trace stream")
            if stream.active:
                stream.active = False
                stream.stop_reason = reason

    def _event(self, stream, frame, boundary):
        stream.loss["attempted_events"] += 1
        sequence = stream.loss["attempted_events"]
        try:
            now = self.clock()
        except Exception:
            now = None
        timestamp = now - stream.origin if type(now) is int else -1
        if not 0 <= timestamp <= SAFE_MAX or now < stream.last_clock:
            stream.loss["event_invalid_timestamp_dropped"] += 1
            stream.active = False
            stream.stop_reason = "source_error"
        elif self.event_slots >= self.config.max_events:
            stream.loss["event_capacity_dropped"] += 1
        else:
            stream.events.append(
                {
                    "sequence": sequence,
                    "frame_id": frame["frame_id"],
                    "boundary": boundary,
                    "timestamp_ns": timestamp,
                }
            )
            stream.loss["retained_events"] += 1
            self.event_slots += 1
        if type(now) is int and 0 <= timestamp <= SAFE_MAX:
            stream.last_clock = max(stream.last_clock, now)

    def capture(self, stream, pts):
        with self.lock:
            if stream is None or not stream.active:
                return
            if stream.loss["offered_frames"] >= 2**31 - 1:
                stream.active = False
                stream.stop_reason = "capacity"
                return
            stream.loss["offered_frames"] += 1
            number = stream.loss["offered_frames"]
            valid_pts = type(pts) is int and 0 <= pts < 2**64 - 1
            previous = stream.pts_frames.get(pts) if valid_pts else None
            if previous is not None:
                previous["correlation"] = "ambiguous"
            correlation = "missing"
            if valid_pts:
                if pts > stream.highest_pts:
                    correlation = "exact"
                    stream.highest_pts = pts
                elif previous is not None:
                    correlation = "ambiguous"
            if (number - 1) % self.config.every_nth_frame:
                stream.loss["unsampled_frames"] += 1
                return
            if self.frame_slots >= self.config.max_frames:
                stream.loss["frame_capacity_dropped"] += 1
                return
            frame = {
                "frame_id": f"frame-{number}",
                "source_sequence": number,
                "correlation": correlation,
            }
            stream.frames.append(frame)
            stream.loss["sampled_frames"] += 1
            self.frame_slots += 1
            if valid_pts and previous is None and correlation == "exact":
                stream.pts_frames[pts] = frame
            self._event(stream, frame, "capture_output")

    def endpoint(self, stream, boundary, pts):
        if boundary not in ENGINE_EVENTS[1:]:
            raise ValueError("unsupported trace endpoint")
        with self.lock:
            if stream is None or not stream.active:
                return
            frame = stream.pts_frames.get(pts) if type(pts) is int else None
            if frame is None or frame["correlation"] != "exact":
                return
            key = (frame["frame_id"], boundary)
            if key in stream.seen_endpoints:
                frame["correlation"] = "ambiguous"
                return
            stream.seen_endpoints.add(key)
            if stream.loss["attempted_events"] >= SAFE_MAX:
                stream.active = False
                stream.stop_reason = "capacity"
                return
            self._event(stream, frame, boundary)

    def finish(self, reason="completed"):
        if reason not in ("completed", "shutdown", "source_error", "capacity"):
            raise ValueError("invalid trace stop reason")
        with self.lock:
            self.finished = True
            for stream in self.streams:
                if stream.active:
                    stream.active = False
                    stream.stop_reason = reason
        # Once finished, callbacks cannot mutate any stream. Filtering/copying is
        # outside the mutex and outside pad callbacks; consumed slots are not reused.

    def snapshot(self, producer_version, provenance="producer_capture"):
        if not self.finished:
            raise ValueError("stop recording before snapshotting")
        if not re.fullmatch(r"[0-9a-f]{40}", producer_version):
            raise ValueError("producer commit is required")
        if provenance not in ("producer_capture", "synthetic") or not self.streams:
            raise ValueError("trace provenance/streams unavailable")
        result = []
        for stream in self.streams:
            data = copy.deepcopy(stream.data())
            correlations = {f["frame_id"]: f["correlation"] for f in data["frames"]}
            events = [
                e
                for e in data["events"]
                if e["boundary"] == "capture_output" or correlations[e["frame_id"]] == "exact"
            ]
            removed = len(data["events"]) - len(events)
            data["events"] = events
            data["loss"]["retained_events"] -= removed
            data["loss"]["event_correlation_dropped"] += removed
            result.append(data)
        return {
            "schema_version": "stage-trace-record-v1",
            "method_release": "n4-stage-local-v1",
            "trace_id": "trace-1",
            "session_id": "session-1",
            "run_id": "run-1",
            "provenance": provenance,
            "producer": "pixelated_engine",
            "producer_version": producer_version,
            "streams": result,
        }
