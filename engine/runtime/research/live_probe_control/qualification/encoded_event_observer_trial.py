"""Run a finite local GStreamer trial and report encoded-pad observations."""

import argparse
import hashlib
import json
import time

from research.live_probe_control.peers.encoded_event_observer import (
    EncodedEventObserver,
)


def run(fps=30):
    if fps not in (24, 30):
        raise ValueError("expected fixture cadence")
    import gi

    gi.require_version("Gst", "1.0")
    from gi.repository import Gst

    Gst.init(None)
    pipeline = Gst.parse_launch(
        f"videotestsrc is-live=true num-buffers={fps * 48 // 10} pattern=ball ! "
        f"video/x-raw,format=I420,width=640,height=480,framerate={fps}/1 ! "
        "vp8enc deadline=1 ! identity name=encoded signal-handoffs=false ! fakesink sync=false"
    )
    identity = pipeline.get_by_name("encoded")
    pad = identity.get_static_pad("src")
    origin = time.monotonic_ns()
    clock_id = "worker-monotonic-" + hashlib.sha256(str(origin).encode()).hexdigest()
    observer = EncodedEventObserver(origin_ns=origin, clock_id=clock_id)
    probe = observer.attach(pad, Gst)
    if not probe:
        raise RuntimeError("encoded probe installation failed")
    try:
        if pipeline.set_state(Gst.State.PLAYING) == Gst.StateChangeReturn.FAILURE:
            raise RuntimeError("trial pipeline startup failed")
        terminal = pipeline.get_bus().timed_pop_filtered(
            10 * Gst.SECOND, Gst.MessageType.EOS | Gst.MessageType.ERROR
        )
        if terminal is None or terminal.type != Gst.MessageType.EOS:
            raise RuntimeError("trial did not complete at EOS")
        # EOS follows the finite stream and arrives before NULL resets identity stats.
        stats = identity.get_property("stats")
        trace = observer.export(identity_count=stats.get_value("num-buffers"))
    finally:
        try:
            pipeline.set_state(Gst.State.NULL)
            _, state, _ = pipeline.get_state(Gst.SECOND)
            if state != Gst.State.NULL:
                raise RuntimeError("trial pipeline did not reach NULL")
        finally:
            pad.remove_probe(probe)
    return {
        "method": "n11-isolated-encoded-observer-trial-v1",
        "gst_version": Gst.version_string(),
        "scope": "finite_local_synthetic_pipeline",
        "terminal": "eos_then_null",
        "configured_fps": fps,
        "phase_start_ns": 600_000_000,
        "phase_end_ns": 4_200_000_000,
        "trace": trace,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fps", type=int, choices=(24, 30), default=30)
    result = run(parser.parse_args().fps)
    print(json.dumps(result, indent=2))
    if result["trace"]["state"] != "count_reconciled":
        raise SystemExit(1)
