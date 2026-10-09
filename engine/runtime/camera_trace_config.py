"""Opt-in, closed N4 collection configuration; no GStreamer dependency."""

from dataclasses import dataclass

SAFE_MAX = 2**53 - 1
MAX_FRAMES = 2000
MAX_EVENTS = 10000
BOUNDARIES = (
    "render_ready",
    "capture_begin",
    "capture_output",
    "pre_encode_queue_enter",
    "pre_encode_queue_exit",
    "encode_input",
    "encode_output",
    "wire_send",
    "receive",
    "decode_ready",
    "presentation_proxy",
)
ENGINE_EVENTS = BOUNDARIES[2:7]
LOSS_FIELDS = (
    "offered_frames",
    "sampled_frames",
    "unsampled_frames",
    "frame_capacity_dropped",
    "attempted_events",
    "retained_events",
    "event_capacity_dropped",
    "event_invalid_timestamp_dropped",
    "event_contention_dropped",
    "event_shutdown_dropped",
    "event_correlation_dropped",
    "browser_missed_presentations",
)


@dataclass(frozen=True)
class TraceConfig:
    every_nth_frame: int = 1
    max_frames: int = MAX_FRAMES
    max_events: int = MAX_EVENTS
    budget_ns: int | None = None

    def __post_init__(self):
        for value, maximum in (
            (self.every_nth_frame, 1000),
            (self.max_frames, MAX_FRAMES),
            (self.max_events, MAX_EVENTS),
        ):
            if type(value) is not int or not 1 <= value <= maximum:
                raise ValueError("N4 trace configuration is outside approved limits")
        if self.budget_ns is not None and (
            type(self.budget_ns) is not int or not 1 <= self.budget_ns <= SAFE_MAX
        ):
            raise ValueError("N4 trace budget must be a positive safe integer")


def parse_trace_config(environment):
    enabled = environment.get("PIXELATED_STAGE_TRACE", "0")
    if enabled == "0":
        return None  # Ignore trace-only knobs on the unchanged disabled path.
    if enabled != "1":
        raise ValueError("PIXELATED_STAGE_TRACE must be 0 or 1")

    def number(name, default):
        raw = environment.get(name)
        if raw is None:
            return default
        if not isinstance(raw, str) or not raw.isascii() or not raw.isdecimal():
            raise ValueError("N4 trace configuration requires decimal integers")
        if len(raw) > 16:
            raise ValueError("N4 trace configuration exceeds its integer bound")
        return int(raw)

    return TraceConfig(
        every_nth_frame=number("PIXELATED_STAGE_TRACE_EVERY_NTH_FRAME", 1),
        max_frames=number("PIXELATED_STAGE_TRACE_MAX_FRAMES", MAX_FRAMES),
        max_events=number("PIXELATED_STAGE_TRACE_MAX_EVENTS", MAX_EVENTS),
        budget_ns=number("PIXELATED_STAGE_TRACE_BUDGET_NS", None),
    )
