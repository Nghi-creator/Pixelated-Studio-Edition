"""Explicit isolated WebRTC cadence worker. Never imported by the gameplay camera."""

import json
import queue
import signal
import sys
import threading
import time
import uuid
from contextlib import nullcontext
from dataclasses import asdict

from .contracts import SECOND, Generation, Policy, Request, Snapshot, digest, integer
from .controller import CadenceController

# Fixed experimental context, not a production safety/quality policy.
POLICY = Policy(24, 30, 3 * SECOND, 1, 5 * SECOND, SECOND, 20, 500000000)
CAPS = "video/x-raw,width=640,height=360,framerate={}/1"
SETTINGS = (
    "target-bitrate",
    "cpu-used",
    "threads",
    "deadline",
    "keyframe-max-dist",
    "end-usage",
    "min-quantizer",
    "max-quantizer",
    "buffer-size",
    "buffer-initial-size",
    "buffer-optimal-size",
    "lag-in-frames",
    "dropframe-threshold",
    "resize-allowed",
)
MAX_GAP_NS = 250000000
MAX_SILENCE_NS = 500000000
MAX_TIMELINE = 1200


def exact_fps(caps):
    if caps is None or caps.get_size() != 1:
        raise ValueError("caps unavailable")
    structure = caps.get_structure(0)
    with (
        structure
        if hasattr(structure, "__enter__")
        else nullcontext(structure) as fields
    ):
        ok, numerator, denominator = fields.get_fraction("framerate")
        if (
            not ok
            or denominator != 1
            or numerator not in (24, 30)
            or fields.get_value("width") != 640
            or fields.get_value("height") != 360
        ):
            raise ValueError("unexpected caps")
        return numerator


def rate_met(count, duration_ns, fps):
    return (
        duration_ns > 0
        and 9 * fps * duration_ns <= 10 * count * SECOND <= 11 * fps * duration_ns
    )


class ReceiverProgress:
    """Bounded receiver PTS/pull evidence; stale, reversed or missing output fails closed."""

    def __init__(self):
        self.timeline = []
        self.valid = True

    def observe(self, pts, now):
        integer(pts, 0, 2**63 - 1)
        integer(now, 0, 2**63 - 1)
        if len(self.timeline) >= MAX_TIMELINE:
            raise ValueError("receiver evidence limit")
        if self.timeline:
            prior = self.timeline[-1]
            if not 0 < pts - prior["pts_ns"] <= MAX_GAP_NS or not (
                0 <= now - prior["observed_at_ns"] <= MAX_SILENCE_NS
            ):
                self.valid = False
        self.timeline.append({"pts_ns": pts, "observed_at_ns": now})

    def healthy(self, now):
        return (
            self.valid
            and len(self.timeline) >= 2
            and 0 <= now - self.timeline[-1]["observed_at_ns"] <= MAX_SILENCE_NS
        )


class WebRTCPort:
    """Owns a fixed disposable sender/receiver pair; no caller pipeline/device input.

    Importable port is deliberately not marked dedicated. Only the explicit CLI
    worker subclass is eligible for the process-killing controller watchdog.
    """

    dedicated_process = False

    def __init__(self, gst, glib):
        self.gst, self.glib = gst, glib
        self.generation = Generation(*(uuid.uuid4().hex for _ in range(3)))
        self.progress = ReceiverProgress()
        self.events = queue.Queue(maxsize=128)
        self.failed = threading.Event()
        self.pipelines = []
        self.origin = time.monotonic_ns()
        self.receipts = []
        self.observations = []
        self.windows = {}
        self.bound = False
        self.closed = False
        self.deadline = self.origin + 18 * SECOND

    def now(self):
        return time.monotonic_ns()

    def _ice(self, _peer, index, candidate, target):
        # Native callbacks retain bounded signaling only; control remains here.
        if type(candidate) is not str or len(candidate) > 4096:
            self.failed.set()
            return
        try:
            self.events.put_nowait((target, index, candidate))
        except queue.Full:
            self.failed.set()

    def _pad(self, _peer, pad):
        if pad.get_direction() != self.gst.PadDirection.SRC:
            return
        sink = self.decoder.get_static_pad("sink")
        if self.bound or pad.link(sink) != self.gst.PadLinkReturn.OK:
            self.failed.set()
        else:
            self.bound = True

    def _promise(self, peer, action, *args):
        done = threading.Event()
        promise = self.gst.Promise.new_with_change_func(
            lambda *_: done.set(), None, None
        )
        peer.emit(action, *args, promise)
        # Never wait indefinitely on GstPromise/native negotiation.
        until = min(self.deadline, self.now() + 3 * SECOND)
        while not done.is_set():
            if self.now() >= until or self.failed.is_set():
                promise.interrupt()
                raise ValueError("signaling deadline")
            self.glib.MainContext.default().iteration(False)
            time.sleep(0.005)
        if promise.wait() != self.gst.PromiseResult.REPLIED:
            raise ValueError("signaling failed")
        reply = promise.get_reply()
        if (
            reply is not None
            and reply.has_field("error")
            and reply.get_value("error") is not None
        ):
            raise ValueError("signaling error")
        if action in ("create-offer", "create-answer"):
            return reply.get_value(
                "offer" if action == "create-offer" else "answer"
            ).copy()
        return None

    def start(self):
        gst = self.gst
        sender = gst.parse_launch(
            "videotestsrc name=capture is-live=true pattern=ball num-buffers=600 "
            '! capsfilter name=cadence caps-change-mode=immediate caps="'
            + CAPS.format(30)
            + '" ! videoconvert ! video/x-raw,format=I420 '
            "! identity name=captured signal-handoffs=false ! vp8enc name=encoder deadline=1 cpu-used=8 threads=2 target-bitrate=1000000 "
            "keyframe-max-dist=30 ! rtpvp8pay pt=96 "
            "! application/x-rtp,media=video,encoding-name=VP8,payload=96 "
            "! webrtcbin name=sender bundle-policy=max-bundle"
        )
        self.pipelines.append(sender)
        receiver = gst.Pipeline.new("owned-receiver")
        self.pipelines.append(receiver)
        self.sender = sender.get_by_name("sender")
        self.receiver = gst.ElementFactory.make("webrtcbin", "receiver")
        if self.receiver is None:
            raise ValueError("receiver unavailable")
        receiver.add(self.receiver)
        self.decoder = gst.parse_bin_from_description(
            "rtpvp8depay ! vp8dec ! appsink name=output sync=false "
            "emit-signals=false max-buffers=32 drop=false",
            True,
        )
        receiver.add(self.decoder)
        self.sink = self.decoder.get_by_name("output")
        self.control = sender.get_by_name("cadence")
        self.capture = sender.get_by_name("capture")
        self.encoder = sender.get_by_name("encoder")
        self.captured = sender.get_by_name("captured")
        self.receiver.connect("pad-added", self._pad)
        self.sender.connect("on-ice-candidate", self._ice, self.receiver)
        self.receiver.connect("on-ice-candidate", self._ice, self.sender)
        for pipeline in reversed(self.pipelines):
            if pipeline.set_state(gst.State.PLAYING) == gst.StateChangeReturn.FAILURE:
                raise ValueError("start failed")
        offer = self._promise(self.sender, "create-offer", None)
        self._promise(self.sender, "set-local-description", offer)
        self._promise(self.receiver, "set-remote-description", offer)
        answer = self._promise(self.receiver, "create-answer", None)
        self._promise(self.receiver, "set-local-description", answer)
        self._promise(self.sender, "set-remote-description", answer)
        until = min(self.deadline, self.now() + 6 * SECOND)
        while self.now() < until:
            self.pump()
            if self.connected() and self.progress.healthy(self.now()):
                return
            time.sleep(0.01)
        raise ValueError("receiver startup deadline")

    def connected(self):
        return all(
            peer.get_property("connection-state").value_nick == "connected"
            for peer in (self.sender, self.receiver)
        )

    def pump(self):
        if self.closed or self.failed.is_set() or self.now() >= self.deadline:
            raise ValueError("worker unavailable")
        context = self.glib.MainContext.default()
        for _ in range(16):
            if not context.pending():
                break
            context.iteration(False)
        for _ in range(128):
            try:
                peer, index, candidate = self.events.get_nowait()
            except queue.Empty:
                break
            peer.emit("add-ice-candidate", index, candidate)
        for pipeline in self.pipelines:
            if pipeline.get_bus().pop_filtered(
                self.gst.MessageType.ERROR | self.gst.MessageType.EOS
            ):
                raise ValueError("pipeline error or eos")
        for _ in range(16):
            sample = self.sink.emit("try-pull-sample", 0)
            if sample is None:
                break
            pts = sample.get_buffer().pts
            if pts == self.gst.CLOCK_TIME_NONE:
                raise ValueError("receiver timestamp missing")
            self.progress.observe(pts, self.now())

    def snapshot(self):
        self.pump()
        settings = {name: self.encoder.get_property(name) for name in SETTINGS}
        states_healthy = all(
            pipeline.get_state(0)[1:]
            == (self.gst.State.PLAYING, self.gst.State.VOID_PENDING)
            for pipeline in self.pipelines
        )
        # Exact dimensions/cadence are validated from configured and source caps.
        settings.update(width=640, height=360, format="I420", transport="webrtc-vp8")
        result = Snapshot(
            self.generation,
            exact_fps(self.control.get_property("caps")),
            exact_fps(self.capture.get_static_pad("src").get_current_caps()),
            digest(settings),
            states_healthy and self.connected() and self.progress.healthy(self.now()),
        )

        if len(self.observations) >= 512:
            raise ValueError("observation limit")
        self.observations.append(
            {
                "at_ns": self.now() - self.origin,
                "configured_fps": result.configured_fps,
                "negotiated_fps": result.negotiated_fps,
                "capture_buffers": integer(
                    self.captured.get_property("stats").get_value("num-buffers"),
                    0,
                    10000,
                ),
                "receiver_frames": len(self.progress.timeline),
                "healthy": result.healthy,
                "settings_hash": result.settings_hash,
            }
        )
        return result

    def measure(self, name, duration_ns):
        self.snapshot()
        start = self.observations[-1].copy()
        self.sleep(duration_ns / SECOND)
        self.snapshot()
        self.windows[name] = {"start": start, "end": self.observations[-1].copy()}

    def set_fps(self, fps):
        if fps not in (24, 30) or type(fps) is not int:
            raise ValueError("unsupported fixed trial rate")
        self.pump()
        receipt = {
            "requested_fps": fps,
            "before_ns": self.now() - self.origin,
            "after_ns": None,
        }
        self.receipts.append(receipt)
        self.control.set_property("caps", self.gst.Caps.from_string(CAPS.format(fps)))
        receipt["after_ns"] = self.now() - self.origin

    def sleep(self, seconds):
        until = self.now() + int(seconds * SECOND)
        while self.now() < until:
            self.pump()
            time.sleep(0.005)

    def verify_restored(self, prior, deadline_ns):
        # Discard settling/backlog before measuring fresh receiver output for .75s.
        settle = self.now() + 200000000
        while self.now() < min(settle, deadline_ns):
            self.sleep(0.01)
        self.snapshot()
        first = self.observations[-1].copy()
        start, count = self.now(), len(self.progress.timeline)
        until = start + 750000000
        while self.now() < until:
            if self.now() >= deadline_ns or self.snapshot() != prior:
                return False
            self.sleep(0.01)
        matches = self.snapshot() == prior
        self.windows["restoration"] = {
            "start": first,
            "end": self.observations[-1].copy(),
        }
        return (
            matches
            and rate_met(
                self.observations[-1]["capture_buffers"] - first["capture_buffers"],
                self.observations[-1]["at_ns"] - first["at_ns"],
                prior.configured_fps,
            )
            and rate_met(
                len(self.progress.timeline) - count,
                self.now() - start,
                prior.configured_fps,
            )
        )

    def close(self):
        self.closed = True
        self.generation = Generation(*(uuid.uuid4().hex for _ in range(3)))
        ok = True
        for pipeline in reversed(self.pipelines):
            result = pipeline.set_state(self.gst.State.NULL)
            _, state, pending = pipeline.get_state(self.gst.SECOND)
            ok = ok and result != self.gst.StateChangeReturn.FAILURE
            ok = (
                ok
                and state == self.gst.State.NULL
                and pending == self.gst.State.VOID_PENDING
            )
        return ok


class _DedicatedWorkerPort(WebRTCPort):
    dedicated_process = True


def main():
    if (
        len(sys.argv) != 4
        or sys.argv[1]
        not in (
            "--isolated-webrtc-trial",
            "--isolated-webrtc-cancel",
            "--isolated-webrtc-disconnect",
        )
        or sys.argv[2] != "--state-directory"
    ):
        print("error: explicit isolated WebRTC trial required", file=sys.stderr)
        return 2
    report = {
        "trial_version": "n10-isolated-webrtc-controller-v1",
        "live_authority": False,
        "scope": "disposable_synthetic_gst_webrtc_pair",
        "quality": "not_evaluated",
        "resource_cost": "not_evaluated",
        "diagnostic_value": "unverified",
        "receiver_scope": "gst_loopback_not_browser",
        "clock_basis": "process_monotonic_relative_ns",
        "pts_basis": "receiver_pipeline_pts_not_source_or_browser_aligned",
        "status": "unavailable",
        "teardown": "not_created",
    }
    port = None
    unresolved = False
    cancelled = threading.Event()
    signal.signal(signal.SIGTERM, lambda *_: cancelled.set())
    signal.signal(signal.SIGINT, lambda *_: cancelled.set())
    try:
        import gi

        gi.require_version("Gst", "1.0")
        gi.require_version("GstWebRTC", "1.0")
        gi.require_version("GstSdp", "1.0")
        from gi.repository import GLib, Gst

        Gst.init(None)
        port = _DedicatedWorkerPort(Gst, GLib)
        report["teardown"] = "unknown"
        port.start()
        port.measure("baseline", 750000000)
        prior = port.snapshot()
        start = time.monotonic_ns()
        cancel_trial = sys.argv[1] == "--isolated-webrtc-cancel"

        def cancellation():
            if (
                sys.argv[1] == "--isolated-webrtc-disconnect"
                and time.monotonic_ns() - start >= SECOND
            ):
                port.pipelines[1].set_state(Gst.State.NULL)
            return cancelled.is_set() or (
                cancel_trial and time.monotonic_ns() - start >= SECOND
            )

        with CadenceController(
            sys.argv[3], POLICY, port, enabled=True, sleep=port.sleep
        ) as control:
            result = control.execute(
                Request("isolated", prior.generation, 24, 3 * SECOND),
                cancelled=cancellation,
            )
            report["result"] = asdict(result)
            report["journal_state"] = control.store.journal["state"]
            unresolved = result.restoration != "verified_by_port"
            if unresolved:
                raise ValueError("restoration unavailable")
        report["status"] = "observed"
    except (Exception, KeyboardInterrupt):  # noqa: BLE001 -- retain partial evidence, teardown below
        report["status"] = "unavailable"
    finally:
        if port is not None:
            report["generation"] = asdict(port.generation)
            report["receipts"] = port.receipts
            report["observations"] = port.observations
            rows = [
                row
                for row in port.observations
                if row["configured_fps"] == row["negotiated_fps"] == 24
                and port.receipts
                and row["at_ns"] >= port.receipts[0]["after_ns"] + POLICY.settling_ns
            ]
            if len(rows) >= 2:
                port.windows["during"] = {"start": rows[0], "end": rows[-1]}
            report["windows"] = port.windows
            report["protocol"] = {
                "baseline_fps": 30,
                "target_fps": 24,
                "requested_duration_ns": 3 * SECOND,
                "settling_ns": POLICY.settling_ns,
                "maximum_pts_gap_ns": MAX_GAP_NS,
                "maximum_pull_gap_ns": MAX_SILENCE_NS,
                "rate_tolerance_percent": 10,
            }
            checks = {}
            for phase, fps in (("baseline", 30), ("during", 24), ("restoration", 30)):
                window = port.windows.get(phase)
                for key in ("capture_buffers", "receiver_frames"):
                    checks[phase + "_" + key] = bool(window) and rate_met(
                        window["end"][key] - window["start"][key],
                        window["end"]["at_ns"] - window["start"]["at_ns"],
                        fps,
                    )
            checks["receiver_continuity"] = port.progress.healthy(port.now())
            report["assessment"] = {
                "checks": checks,
                "status": "met" if all(checks.values()) else "not_met",
            }
            report["receiver_timeline"] = [
                {
                    "pts_ns": row["pts_ns"],
                    "observed_at_ns": row["observed_at_ns"] - port.origin,
                }
                for row in port.progress.timeline
            ]
            try:
                report["teardown"] = "null_observed" if port.close() else "unknown"
            except Exception:  # noqa: BLE001 -- failed native teardown stays unknown
                report["teardown"] = "unknown"
            if report["teardown"] != "null_observed":
                report["status"] = "unavailable"
    print(json.dumps(report, indent=2, sort_keys=True, allow_nan=False), flush=True)
    if unresolved:
        # Never outlive a dirty result as a reusable worker or cancel its guard.
        while True:
            time.sleep(0.1)
    return 0 if report["status"] == "observed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
