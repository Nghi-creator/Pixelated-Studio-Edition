"""Opt-in disposable Linux peer isolation proof; never enabled on a user desktop."""

import os
import queue
import signal
import subprocess
import sys
import time
import unittest
from contextlib import ExitStack
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from live_probe_control.game_scene import GameScene
from live_probe_control.peer_lifetime import ParentLease
from live_probe_control.peer_supervisor import PeerSupervisor, child_environment

NATIVE = os.environ.get("N10_NATIVE_PEER_TESTS") == "1" and sys.platform == "linux"


class Receiver:
    def __init__(self, Gst, GstWebRTC, GstSdp):
        self.Gst, self.rtc, self.sdp = Gst, GstWebRTC, GstSdp
        self.ice = queue.Queue(maxsize=128)
        self.errors = queue.Queue(maxsize=8)
        self.pipeline = Gst.Pipeline.new(None)
        self.webrtc = Gst.ElementFactory.make("webrtcbin")
        self.webrtc.set_property("bundle-policy", "max-bundle")
        self.pipeline.add(self.webrtc)
        self.decoders = {}
        for media, encoding, pt, chain in (
            ("video", "VP8", 96, "rtpvp8depay ! vp8dec"),
            ("audio", "OPUS", 111, "rtpopusdepay ! opusdec"),
        ):
            decoder = Gst.parse_bin_from_description(
                chain + f" ! fakesink name={media} sync=false", True
            )
            self.decoders[media] = decoder
            self.pipeline.add(decoder)
            caps = Gst.Caps.from_string(
                f"application/x-rtp,media={media},encoding-name={encoding},payload={pt},clock-rate={90000 if media == 'video' else 48000}"
            )
            self.webrtc.emit(
                "add-transceiver",
                GstWebRTC.WebRTCRTPTransceiverDirection.RECVONLY,
                caps,
            )
        self.webrtc.connect("pad-added", self.pad)
        self.webrtc.connect("on-ice-candidate", self.candidate)
        self.pipeline.set_state(Gst.State.PLAYING)

    def pad(self, _, pad):
        try:
            if pad.direction != self.Gst.PadDirection.SRC:
                return
            caps = pad.get_current_caps()
            # Caps strings avoid Gst StructureWrapper lifetime differences.
            text = caps.to_string()
            media = "video" if "VP8" in text else "audio" if "OPUS" in text else None
            if (
                media is None
                or pad.link(self.decoders[media].get_static_pad("sink"))
                != self.Gst.PadLinkReturn.OK
            ):
                raise ValueError("receiver pad linking failed")
        except Exception as exc:  # noqa: BLE001 -- report native callback failures to test owner
            self.errors.put_nowait(type(exc).__name__)

    def candidate(self, _, index, candidate):
        if candidate:
            self.ice.put_nowait((index, candidate))

    def description(self, action, *args):
        import threading

        done = threading.Event()
        promise = self.Gst.Promise.new_with_change_func(
            lambda *_: done.set(), None, None
        )
        self.webrtc.emit(action, *args, promise)
        if not done.wait(3):
            promise.interrupt()
            raise ValueError("receiver description deadline")
        if promise.wait() != self.Gst.PromiseResult.REPLIED:
            raise ValueError("receiver description failed")
        reply = promise.get_reply()
        if (
            reply is not None
            and reply.has_field("error")
            and reply.get_value("error") is not None
        ):
            raise ValueError("receiver description error")
        return reply.get_value("offer").copy() if action == "create-offer" else None

    def offer(self):
        offer = self.description("create-offer", None)
        self.description("set-local-description", offer)
        return offer.sdp.as_text()

    def answer(self, sdp):
        result, message = self.sdp.SDPMessage.new_from_text(sdp)
        if result != self.sdp.SDPResult.OK:
            raise ValueError("invalid answer")
        description = self.rtc.WebRTCSessionDescription.new(
            self.rtc.WebRTCSDPType.ANSWER, message
        )
        self.description("set-remote-description", description)

    def frames(self, media="video"):
        if not self.errors.empty():
            raise ValueError(self.errors.get_nowait())
        error = self.pipeline.get_bus().pop_filtered(self.Gst.MessageType.ERROR)
        if error:
            raise ValueError(str(error.parse_error()))
        return (
            self.decoders[media]
            .get_by_name(media)
            .get_property("stats")
            .get_value("rendered")
        )

    def close(self):
        self.pipeline.set_state(self.Gst.State.NULL)
        _, state, pending = self.pipeline.get_state(self.Gst.SECOND)
        if state != self.Gst.State.NULL or pending != self.Gst.State.VOID_PENDING:
            raise ValueError("receiver teardown unobserved")


@unittest.skipUnless(
    NATIVE, "requires explicitly enabled disposable Linux native runtime"
)
class PeerNativeTests(unittest.TestCase):
    def test_lifetime_guard_eof_and_poll_stall_kill_only_owned_child(self):
        for stalled in (False, True):
            with self.subTest(stalled=stalled), ExitStack() as cleanup:
                child = subprocess.Popen(
                    [sys.executable, "-c", "import time; time.sleep(20)"]
                )
                sibling = subprocess.Popen(
                    [sys.executable, "-c", "import time; time.sleep(20)"]
                )
                for process in (child, sibling):
                    cleanup.callback(lambda p=process: p.wait(timeout=2))
                    cleanup.callback(
                        lambda p=process: p.kill() if p.poll() is None else None
                    )
                pidfd = os.pidfd_open(child.pid)
                cleanup.callback(os.close, pidfd)
                lease = ParentLease(pidfd, child_environment(os.environ))
                cleanup.callback(lease.close)
                lease.heartbeat()
                if not stalled:
                    os.close(lease.write_fd)
                    lease.write_fd = None
                self.assertEqual(child.wait(timeout=5), -signal.SIGKILL)
                self.assertIsNone(sibling.poll())

    def test_two_peers_worker_loss_preserves_other_stream_and_game(self):
        with ExitStack() as cleanup:
            scene = GameScene()
            cleanup.callback(lambda: self.assertTrue(scene.close()))
            scene.start()  # XInitThreads before GI streaming threads.
            import gi

            gi.require_version("Gst", "1.0")
            gi.require_version("GstWebRTC", "1.0")
            gi.require_version("GstSdp", "1.0")
            from gi.repository import GLib, Gst, GstSdp, GstWebRTC

            Gst.init(None)
            owners = [
                cleanup.enter_context(PeerSupervisor(enabled=True)) for _ in range(2)
            ]
            receivers = []
            for owner in owners:
                owner.start(
                    {"id": "balanced", "fps": 30, "bitrate_kbps": 1500},
                    source="isolated_synthetic",
                )
                receiver = Receiver(Gst, GstWebRTC, GstSdp)
                cleanup.callback(receiver.close)
                receivers.append(receiver)
            offers = [receiver.offer() for receiver in receivers]
            sent = [False, False]
            context = GLib.MainContext.default()

            def pump():
                for _ in range(32):
                    if not context.pending():
                        break
                    context.iteration(False)
                scene.tick()
                for i, (owner, receiver) in enumerate(
                    zip(owners, receivers, strict=True)
                ):
                    if owner.state == "ready" and not sent[i]:
                        owner.offer(offers[i])
                        sent[i] = True
                    if sent[i] and owner.state in ("answering", "playing"):
                        for _ in range(128):
                            try:
                                index, candidate = receiver.ice.get_nowait()
                            except queue.Empty:
                                break
                            owner.ice(index, candidate)
                    for message in owner.poll():
                        if message["kind"] == "answer":
                            receiver.answer(message["body"]["sdp"])
                        elif message["kind"] == "ice":
                            body = message["body"]
                            receiver.webrtc.emit(
                                "add-ice-candidate", body["index"], body["candidate"]
                            )
                time.sleep(0.005)

            deadline = time.monotonic() + 15
            while time.monotonic() < deadline and not all(
                r.frames() >= 20 and r.frames("audio") >= 20 for r in receivers
            ):
                pump()
                self.assertTrue(
                    all(o.state != "failed" for o in owners),
                    [(o.state, o.reason, o.exit_code) for o in owners],
                )
            self.assertTrue(
                all(r.frames() >= 20 and r.frames("audio") >= 20 for r in receivers)
            )
            self.assertTrue(
                all(o.last_snapshot["negotiated_fps"] == 30 for o in owners)
            )
            for owner in owners:
                snap = owner.last_snapshot
                self.assertGreater(snap["capture_buffers"], 0)
                self.assertGreater(snap["encoded_buffers"], 0)
                self.assertEqual(snap["configured_fps"], 30)
                self.assertEqual(snap["width"], 640)
                self.assertEqual(snap["height"], 480)
                self.assertEqual(snap["target_bitrate"], 1500000)
                self.assertFalse(owner.live_authority)
                self.assertFalse(owner.mutation_available)
            before = receivers[1].frames()
            game_before = scene.resources()["cpu_ticks"]
            signal.pidfd_send_signal(owners[0].pidfd, signal.SIGKILL)
            deadline = time.monotonic() + 2
            while time.monotonic() < deadline:
                pump()
            self.assertEqual(owners[0].state, "failed")
            self.assertEqual(owners[0].exit_code, -signal.SIGKILL)
            self.assertEqual(owners[1].state, "playing")
            self.assertGreater(receivers[1].frames(), before + 20)
            self.assertIsNone(scene.game.poll())
            self.assertGreater(scene.resources()["cpu_ticks"], game_before)
            owners[1].shutdown()
            deadline = time.monotonic() + 3
            while (
                owners[1].state not in ("closed", "failed")
                and time.monotonic() < deadline
            ):
                pump()
            self.assertEqual(owners[1].state, "closed")
            self.assertEqual(owners[1].closed_reply, "null_observed")
            self.assertEqual(owners[1].exit_code, 0)
            self.assertTrue(
                all(
                    o.child is None and o.pidfd is None and o.lease is None
                    for o in owners
                )
            )


if __name__ == "__main__":
    unittest.main()
