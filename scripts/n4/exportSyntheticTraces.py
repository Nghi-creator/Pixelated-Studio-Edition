"""Export fixed synthetic collector inputs for the core's independent N4 fixtures."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'engine/runtime'))
from camera_trace import HostTraceRecording
from camera_trace_config import ENGINE_EVENTS, TraceConfig
from camera_trace_export import trace_bundle_bytes, write_trace_bundle


def main():
    destination = Path(sys.argv[1])
    # Fixed synthetic clocks and opaque PTS; never real capture evidence.
    rows = [(0, 1000000, 4000000, 5000000, 9000000),
            (20000000, 21000000, 21000000, 22000000, 32000000),
            (40000000, 41000000, 46000000, 47000000, 57000000),
            (60000000, 61000000)]
    ticks = iter([100, *(100 + timestamp for row in rows for timestamp in row)])
    recording = HostTraceRecording(TraceConfig(budget_ns=12000000),
                                   clock=lambda: next(ticks), resolution_ns=1)
    stream = recording.begin()
    for pts, row in enumerate(rows):
        recording.capture(stream, pts)
        for boundary in ENGINE_EVENTS[1:len(row)]:
            recording.endpoint(stream, boundary, pts)
    recording.finish()
    write_trace_bundle(destination / 'host.tar.gz',
                       trace_bundle_bytes(recording, 'a' * 40, 'synthetic'))


if __name__ == '__main__':
    main()
