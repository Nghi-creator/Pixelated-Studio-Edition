"""Disposable native regression child; no device, game, browser or network source."""

import json
import sys
import threading
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from live_probe_control import CadenceController, Generation, Policy, Request, Snapshot
from live_probe_control.webrtc_worker import exact_fps

GENERATION = Generation(
    "thread-fault-owner", "thread-fault-pipeline", "thread-fault-peer"
)
POLICY = Policy(24, 30, 1000000000, 1, 3000000000, 1000000000, 20, 100000000)


def emit(**values):
    print(json.dumps(values), flush=True)


def run(mode, directory):
    if mode not in ("exit", "block"):
        raise ValueError("closed thread-fault mode required")
    import gi

    gi.require_version("Gst", "1.0")
    from gi.repository import Gst

    Gst.init(None)
    pipeline = Gst.parse_launch(
        "videotestsrc is-live=true pattern=ball ! "
        'capsfilter name=rate caps-change-mode=immediate caps="video/x-raw,width=64,height=48,framerate=30/1" '
        "! fakesink name=sink sync=false signal-handoffs=true"
    )
    rate = pipeline.get_by_name("rate")
    sink = pipeline.get_by_name("sink")
    frames = [0]
    fault = threading.Event()

    def handoff(*_args):
        frames[0] += 1

    sink.connect("handoff", handoff)

    def negotiated():
        caps = sink.get_static_pad("sink").get_current_caps()
        if caps is None:
            return None
        return exact_fps(caps, dimensions=(64, 48))

    class Port:
        dedicated_process = True

        def snapshot(self):
            caps = rate.get_property("caps")
            return Snapshot(
                GENERATION,
                exact_fps(caps, dimensions=(64, 48)),
                negotiated(),
                "a" * 64,
                True,
            )

        def set_fps(self, value):
            rate.set_property(
                "caps",
                Gst.Caps.from_string(
                    f"video/x-raw,width=64,height=48,framerate={value}/1"
                ),
            )
            until = time.monotonic() + 1
            while negotiated() != value:
                if time.monotonic() >= until:
                    raise ValueError("target caps deadline")
                time.sleep(0.005)
            emit(kind="fault_injected", mode=mode, fps=negotiated(), frames=frames[0])
            fault.set()
            if mode == "exit":
                # SystemExit terminates only this controller thread. Ordinary
                # exceptions exercise the controller's existing restore path.
                raise SystemExit()
            threading.Event().wait(10)
            raise ValueError("blocked controller outlived watchdog")

        def verify_restored(self, _prior, _deadline):
            raise AssertionError("faulted control thread must not claim restoration")

    def control():
        with CadenceController(directory, POLICY, Port(), enabled=True) as owner:
            owner.execute(Request("thread-fault", GENERATION, 24, 1000000000))
        emit(kind="unexpected_controller_return")

    try:
        if pipeline.set_state(Gst.State.PLAYING) == Gst.StateChangeReturn.FAILURE:
            raise ValueError("synthetic media startup failed")
        until = time.monotonic() + 2
        while frames[0] < 3 or negotiated() != 30:
            if time.monotonic() >= until:
                raise ValueError("synthetic media readiness deadline")
            time.sleep(0.01)
        worker = threading.Thread(target=control, daemon=True)
        worker.start()
        until = time.monotonic() + 6
        while time.monotonic() < until:
            if fault.is_set():
                emit(
                    kind="media_after_fault",
                    fps=negotiated(),
                    frames=frames[0],
                    control_thread_alive=worker.is_alive(),
                )
            time.sleep(0.1)
        raise ValueError("independent watchdog failed to terminate owned worker")
    finally:
        pipeline.set_state(Gst.State.NULL)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(2)
    run(sys.argv[1], Path(sys.argv[2]))
