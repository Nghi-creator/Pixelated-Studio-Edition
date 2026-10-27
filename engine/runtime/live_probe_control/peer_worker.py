"""Dedicated one-pipeline answerer. Explicit private CLI only; no camera import."""

import json
import os
import queue
import signal
import sys
import time
from contextlib import nullcontext

from .peer_protocol import (
    MAX_BUFFER,
    PROFILE_ENCODERS,
    SNAPSHOT_COUNTERS,
    SNAPSHOT_STATES,
    Lines,
    encode,
    event,
)


def counter(value):
    return value if type(value) is int and 0 <= value <= 2**53 - 1 else None


def caps_values(caps):
    if caps is None or caps.get_size() != 1:
        return None, None, None
    structure = caps.get_structure(0)
    with (
        structure
        if hasattr(structure, "__enter__")
        else nullcontext(structure) as fields
    ):
        ok, num, den = fields.get_fraction("framerate")
        return (
            counter(num) if ok and den == 1 else None,
            counter(fields.get_value("width")) if fields.has_field("width") else None,
            counter(fields.get_value("height")) if fields.has_field("height") else None,
        )


class PeerMedia:
    def __init__(self, bootstrap, emit):
        # Only after closed bootstrap validation and only inside the dedicated child.
        if bootstrap["body"]["source"] == "production":
            import ctypes

            if not ctypes.CDLL("libX11.so.6").XInitThreads():
                raise ValueError("Xlib threading unavailable")
        import gi

        gi.require_version("Gst", "1.0")
        gi.require_version("GstWebRTC", "1.0")
        gi.require_version("GstSdp", "1.0")
        gi.require_version("GstVideo", "1.0")
        from camera_config import configure_ice_servers
        from gi.repository import Gst, GstSdp, GstVideo, GstWebRTC

        self.gst, self.sdp, self.rtc, self.video = Gst, GstSdp, GstWebRTC, GstVideo
        Gst.init(None)
        self.emit = emit
        self.bootstrap = bootstrap
        self.offer = None
        self.events = queue.Queue(maxsize=128)
        self.failed = False
        self.closed = False
        self.startup_keyframe_pending = self.startup_keyframe_attempted = False
        self.startup_keyframe_accepted = None
        self.overruns = 0
        self.pending_ice = []
        self.origin = time.monotonic_ns()
        self.latest_snapshot = None
        settings = bootstrap["body"]["profile"]
        cpu, quantizer = PROFILE_ENCODERS[settings["id"]]
        isolated = bootstrap["body"]["source"] == "isolated_synthetic"
        source = (
            "videotestsrc name=video_capture is-live=true pattern=ball ! video/x-raw,width=640,height=480"
            if isolated
            else "ximagesrc name=video_capture display-name=:99 use-damage=false show-pointer=false"
        )
        audio = (
            "audiotestsrc is-live=true wave=silence"
            if isolated
            else "pulsesrc device=auto_null.monitor provide-clock=false"
        )
        text = (
            "webrtcbin name=sendrecv bundle-policy=max-bundle "
            f'{source} ! capsfilter name=source_rate caps-change-mode=immediate caps="video/x-raw,framerate={settings["fps"]}/1" '
            "! videoconvert ! video/x-raw,format=I420 ! identity name=captured signal-handoffs=false "
            "! queue name=pre_encoder_queue max-size-buffers=1 leaky=downstream "
            f"! vp8enc name=video_encoder deadline=1 cpu-used={cpu} threads=4 end-usage=cbr "
            f"target-bitrate={settings['bitrate_kbps'] * 1000} max-quantizer={quantizer} min-quantizer=4 "
            "keyframe-max-dist=120 error-resilient=1 ! identity name=encoded signal-handoffs=false "
            "! rtpvp8pay pt=96 ! queue name=post_encoder_queue max-size-buffers=1 leaky=downstream "
            "! application/x-rtp,media=video,encoding-name=VP8,payload=96 ! sendrecv. "
            f"{audio} ! audioconvert ! audioresample ! queue max-size-buffers=3 leaky=downstream "
            "! opusenc ! rtpopuspay pt=111 ! queue ! application/x-rtp,media=audio,encoding-name=OPUS,payload=111 ! sendrecv."
        )
        self.pipeline = Gst.parse_launch(text)
        self.webrtc = self.pipeline.get_by_name("sendrecv")
        try:
            configure_ice_servers(
                self.webrtc,
                json.dumps(bootstrap["body"]["ice_servers"]),
                emit=lambda _: None,
            )
            self.webrtc.connect("on-ice-candidate", self._ice)
            self.webrtc.connect("notify::connection-state", self._connection_changed)
            for name in ("pre_encoder_queue", "post_encoder_queue"):
                self.pipeline.get_by_name(name).connect("overrun", self._overrun)
            if (
                self.pipeline.set_state(Gst.State.READY)
                == Gst.StateChangeReturn.FAILURE
            ):
                raise ValueError("peer pipeline unavailable")
        except BaseException:
            self.close()
            raise

    def _connection_changed(self, *_):
        # Gst may notify from a media thread: only enqueue the one-shot intent.
        if self.closed or self.startup_keyframe_attempted:
            return
        try:
            if self.webrtc.get_property("connection-state").value_nick == "connected":
                self.startup_keyframe_pending = True
        except (ValueError, TypeError, AttributeError, RuntimeError):
            return

    def _request_startup_keyframe(self):
        if self.closed or self.offer is None or not self.startup_keyframe_pending or self.startup_keyframe_attempted:
            return
        try:
            connected = self.webrtc.get_property("connection-state").value_nick == "connected"
        except (ValueError, TypeError, AttributeError, RuntimeError):
            return
        if not connected:
            return
        # The initial encoded keyframe can precede ICE/DTLS readiness. Request
        # one fresh keyframe off callbacks; retain normal periodic encoding if
        # a downstream implementation does not accept the request.
        self.startup_keyframe_attempted = True
        self.startup_keyframe_pending = False
        event = self.video.video_event_new_upstream_force_key_unit(self.gst.CLOCK_TIME_NONE, True, 1)
        self.startup_keyframe_accepted = self.pipeline.get_by_name("video_encoder").get_static_pad("src").send_event(event)

    def _overrun(self, _):
        if not self.closed:
            self.overruns += 1

    def _ice(self, _, index, candidate):
        # Gst emits an empty/None end-of-gathering marker, not a candidate.
        if candidate is None or candidate == "":
            return
        try:
            self.events.put_nowait((index, candidate))
        except queue.Full:
            self.failed = True

    def _description(self, action, *args):
        import threading

        done = threading.Event()
        promise = self.gst.Promise.new_with_change_func(
            lambda *_: done.set(), None, None
        )
        self.webrtc.emit(action, *args, promise)
        if not done.wait(timeout=3):
            promise.interrupt()
            raise ValueError("peer negotiation deadline")
        if promise.wait() != self.gst.PromiseResult.REPLIED:
            raise ValueError("peer negotiation interrupted")
        reply = promise.get_reply()
        if (
            reply is not None
            and reply.has_field("error")
            and reply.get_value("error") is not None
        ):
            raise ValueError("peer negotiation failed")
        return reply.get_value("answer").copy() if action == "create-answer" else None

    def answer(self, request):
        if self.offer is not None:
            raise ValueError("one offer per dedicated peer")
        self.offer = request
        result, sdp = self.sdp.SDPMessage.new_from_text(request["body"]["sdp"])
        if result != self.sdp.SDPResult.OK:
            raise ValueError("peer offer unavailable")
        if (
            self.pipeline.set_state(self.gst.State.PLAYING)
            == self.gst.StateChangeReturn.FAILURE
        ):
            raise ValueError("peer playing failed")
        description = self.rtc.WebRTCSessionDescription.new(
            self.rtc.WebRTCSDPType.OFFER, sdp
        )
        self._description("set-remote-description", description)
        for index, candidate in self.pending_ice:
            self.webrtc.emit("add-ice-candidate", index, candidate)
        self.pending_ice.clear()
        answer = self._description("create-answer", None)
        self._description("set-local-description", answer)
        self.emit(request, "answer", {"sdp": answer.sdp.as_text()})

    def ice(self, request):
        index, candidate = request["body"]["index"], request["body"]["candidate"]
        if self.offer is None:
            if len(self.pending_ice) >= 128:
                raise ValueError("peer candidate budget")
            self.pending_ice.append((index, candidate))
            status = "queued"
        else:
            self.webrtc.emit("add-ice-candidate", index, candidate)
            status = "forwarded"
        self.emit(request, "ack", {"state": status})

    def snapshot(self):
        start = time.monotonic_ns() - self.origin
        result, current, pending = self.pipeline.get_state(0)
        state = "unavailable"
        if (
            result != self.gst.StateChangeReturn.FAILURE
            and pending == self.gst.State.VOID_PENDING
        ):
            if current == self.gst.State.PLAYING:
                state = "playing"
            elif current == self.gst.State.READY:
                state = "ready"
        values = {key: None for key in SNAPSHOT_COUNTERS}
        for key, allowed in SNAPSHOT_STATES.items():
            try:
                native = self.webrtc.get_property(key.replace("_", "-")).value_nick
                values[key] = native if native in allowed else "unknown"
            except (ValueError, TypeError, AttributeError, RuntimeError):
                values[key] = "unknown"
        for name, key in (
            ("captured", "capture_buffers"),
            ("encoded", "encoded_buffers"),
        ):
            try:
                values[key] = counter(
                    self.pipeline.get_by_name(name)
                    .get_property("stats")
                    .get_value("num-buffers")
                )
            except (ValueError, TypeError, AttributeError):
                pass
        values["queue_overruns_total"] = counter(self.overruns)
        for name, key in (
            ("pre_encoder_queue", "pre_encoder_queue_level"),
            ("post_encoder_queue", "post_encoder_queue_level"),
        ):
            try:
                values[key] = counter(
                    self.pipeline.get_by_name(name).get_property(
                        "current-level-buffers"
                    )
                )
            except (ValueError, TypeError, AttributeError):
                pass
        try:
            values["configured_fps"] = caps_values(
                self.pipeline.get_by_name("source_rate").get_property("caps")
            )[0]
            values["negotiated_fps"], values["width"], values["height"] = caps_values(
                self.pipeline.get_by_name("video_capture")
                .get_static_pad("src")
                .get_current_caps()
            )
            encoder = self.pipeline.get_by_name("video_encoder")
            for prop, key in (
                ("target-bitrate", "target_bitrate"),
                ("cpu-used", "cpu_used"),
                ("max-quantizer", "max_quantizer"),
            ):
                values[key] = counter(encoder.get_property(prop))
        except (ValueError, TypeError, AttributeError):
            pass
        snapshot = dict(
            read_start_ns=start,
            read_end_ns=time.monotonic_ns() - self.origin,
            state=state,
            **values,
        )
        self.latest_snapshot = (snapshot, time.monotonic_ns())
        return snapshot

    def poll(self):
        self._request_startup_keyframe()
        if self.failed or self.pipeline.get_bus().pop_filtered(
            self.gst.MessageType.ERROR | self.gst.MessageType.EOS
        ):
            raise ValueError("peer media failed")
        for _ in range(128):
            try:
                index, candidate = self.events.get_nowait()
            except queue.Empty:
                break
            if self.offer is None:
                raise ValueError("peer ICE without a negotiation")
            self.emit(self.offer, "ice", {"index": index, "candidate": candidate})

    def close(self):
        self.closed = True
        result = self.pipeline.set_state(self.gst.State.NULL)
        _, state, pending = self.pipeline.get_state(self.gst.SECOND)
        return (
            result != self.gst.StateChangeReturn.FAILURE
            and state == self.gst.State.NULL
            and pending == self.gst.State.VOID_PENDING
        )


def main():
    if sys.argv[1:] != ["--dedicated-peer-worker"]:
        print("error: dedicated private peer worker required", file=sys.stderr)
        return 2
    os.set_blocking(sys.stdin.fileno(), False)
    os.set_blocking(sys.stdout.fileno(), False)
    lines = Lines()
    tx = b""
    media = control = bootstrap = last_request = None
    next_sequence = 0
    last_snapshot = 0
    startup = time.monotonic() + 5
    cancelled = False

    def stop(*_):
        nonlocal cancelled
        cancelled = True

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)

    def emit(request, kind, body):
        nonlocal tx
        data = encode(event(request, kind, body))
        if len(tx) + len(data) > MAX_BUFFER:
            raise ValueError("peer output budget")
        tx += data

    status = 1
    try:
        closing = False
        closed_ok = False
        pending_shutdown = None
        while True:
            if cancelled:
                break
            if tx:
                try:
                    count = os.write(sys.stdout.fileno(), tx[:16384])
                    tx = tx[count:]
                except BlockingIOError:
                    pass
            if closing and not tx:
                status = 0 if closed_ok else 1
                break
            if not closing:
                try:
                    data = os.read(sys.stdin.fileno(), 16384)
                except BlockingIOError:
                    data = None
                if data == b"":
                    break
                for request in lines.feed(data or b"", incoming_command=True):
                    if request["sequence"] != next_sequence or (
                        bootstrap is not None
                        and request["generation"] != bootstrap["generation"]
                    ):
                        raise ValueError("stale private peer command")
                    next_sequence += 1
                    last_request = request
                    kind = request["kind"]
                    if bootstrap is None:
                        if kind != "bootstrap":
                            raise ValueError("bootstrap required")
                        bootstrap = request
                        media = PeerMedia(bootstrap, emit)
                        from .peer_control import PeerControl

                        control = PeerControl(media, emit)
                        emit(
                            bootstrap,
                            "ready",
                            {"live_authority": False, "mutation_available": False},
                        )
                    elif kind == "offer":
                        media.answer(request)
                    elif kind == "ice":
                        media.ice(request)
                    elif kind == "probe":
                        control.start(request)
                    elif kind == "probe_heartbeat":
                        control.heartbeat(request["body"])
                        emit(request, "ack", {"state": "forwarded"})
                    elif kind == "probe_cancel":
                        control.cancel(request["body"]["request_id"])
                        emit(request, "ack", {"state": "forwarded"})
                    elif kind == "shutdown":
                        if control.running():
                            control.cancel()
                            pending_shutdown = request
                            break
                        ok = media.close()
                        closed_ok = ok
                        emit(
                            request,
                            "closed",
                            {"teardown": "null_observed" if ok else "unknown"},
                        )
                        closing = True
                        break
                    else:
                        raise ValueError("duplicate peer bootstrap")
                if media is not None and not closing:
                    media.poll()
                    control.poll()
                    if pending_shutdown is not None and not control.running():
                        closed_ok = media.close()
                        emit(
                            pending_shutdown,
                            "closed",
                            {"teardown": "null_observed" if closed_ok else "unknown"},
                        )
                        closing = True
                    if not closing and time.monotonic() - last_snapshot >= 0.5:
                        emit(bootstrap, "snapshot", media.snapshot())
                        last_snapshot = time.monotonic()
                elif media is None and time.monotonic() > startup:
                    break
            time.sleep(0.005)
    except (Exception, KeyboardInterrupt):  # noqa: BLE001 -- fixed private error only, mandatory teardown below
        if last_request is not None:
            try:
                emit(last_request, "error", {"reason": "media_failed"})
                if tx:
                    os.write(sys.stdout.fileno(), tx)
            except (OSError, ValueError):
                pass
    finally:
        if control is not None:
            control.cancel()
        if media is not None and not (control is not None and control.running()):
            try:
                media.close()
            except Exception:  # noqa: BLE001 -- hard owner lease remains authoritative
                status = 1
    return status


if __name__ == "__main__":
    raise SystemExit(main())
