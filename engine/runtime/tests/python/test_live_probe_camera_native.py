"""Actual camera callbacks, x99 capture and Pulse monitor in a disposable container."""

import os
import queue
import signal
import subprocess
import sys
import tempfile
import time
import unittest
from contextlib import ExitStack
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
import test_live_probe_camera_workers as camera_helpers
from live_probe_control.camera_workers import CameraWorkers
from live_probe_control.contracts import Policy
from live_probe_control.game_scene import GameScene
from live_probe_control.local_owner import LocalProbeOwner, ReceiverSample
from test_live_probe_peer_native import NATIVE, Receiver


@unittest.skipUnless(
    NATIVE, "requires explicitly enabled disposable Linux native runtime"
)
class CameraNativeTests(unittest.TestCase):
    def test_camera_route_x_capture_audio_reconnect_and_shutdown(self):
        with ExitStack() as cleanup:
            scene = GameScene()
            cleanup.callback(lambda: self.assertTrue(scene.close()))
            original_popen = subprocess.Popen

            def private_x99(argv, *args, **kwargs):
                # This container owns every display; reuse the game scene's exact
                # handles while requesting the production capture display number.
                if argv[0] == "/usr/bin/Xvfb":
                    argv = [argv[0], ":99", *argv[1:]]
                return original_popen(argv, *args, **kwargs)

            with patch(
                "live_probe_control.game_scene.subprocess.Popen",
                side_effect=private_x99,
            ):
                scene.start()
            self.assertEqual(scene.number, 99)
            runtime_directory = cleanup.enter_context(tempfile.TemporaryDirectory())
            cleanup.enter_context(
                patch.dict(
                    os.environ,
                    {
                        "PULSE_SERVER": "127.0.0.1",
                        "XDG_RUNTIME_DIR": runtime_directory,
                        "XDG_CONFIG_HOME": runtime_directory + "/config",
                    },
                )
            )
            pulse_log = cleanup.enter_context(tempfile.TemporaryFile())
            pulse = subprocess.Popen(
                [
                    "pulseaudio",
                    "--daemonize=no",
                    "--exit-idle-time=-1",
                    "--disable-shm=yes",
                    "--use-pid-file=no",
                    "--log-level=error",
                    "--load=module-native-protocol-tcp auth-anonymous=1",
                ],
                stdout=subprocess.DEVNULL,
                stderr=pulse_log,
            )
            cleanup.callback(lambda: pulse.wait(timeout=2))
            cleanup.callback(
                lambda: pulse.terminate() if pulse.poll() is None else None
            )
            deadline = time.monotonic() + 3
            while time.monotonic() < deadline:
                ready = subprocess.run(
                    ["pactl", "list", "short", "sources"],
                    capture_output=True,
                    check=False,
                    timeout=1,
                )
                if ready.returncode == 0 and b"auto_null.monitor" in ready.stdout:
                    break
                time.sleep(0.05)
            pulse_log.seek(0)
            self.assertEqual(
                ready.returncode, 0, pulse_log.read(4096).decode(errors="replace")
            )
            self.assertIn(b"auto_null.monitor", ready.stdout)
            import gi

            gi.require_version("Gst", "1.0")
            gi.require_version("GstWebRTC", "1.0")
            gi.require_version("GstSdp", "1.0")
            from gi.repository import GLib, Gst, GstSdp, GstWebRTC

            Gst.init(None)
            service = CameraWorkers(
                {"id": "balanced", "fps": 30, "bitrate_kbps": 1500}, "[]", 2
            )
            cleanup.callback(lambda: self.assertTrue(service.close()))
            harness = camera_helpers.CameraCallbacks()
            camera = harness.namespace()
            camera["WORKERS"] = service
            # Poll actual callback bodies; no control/signaling socket is added.
            receivers = {}
            outgoing = queue.Queue(maxsize=256)
            camera["sio"].emit = lambda kind, body: outgoing.put_nowait((kind, body))

            def receive(peer_id):
                receiver = Receiver(Gst, GstWebRTC, GstSdp)
                cleanup.callback(receiver.close)
                receivers[peer_id] = receiver
                camera["on_offer"](
                    {"peerId": peer_id, "type": "offer", "sdp": receiver.offer()}
                )
                while harness.pending:
                    harness.pending.pop(0)()
                return receiver

            _first, second = receive("first"), receive("second")
            context = GLib.MainContext.default()

            def pump():
                for _ in range(32):
                    if not context.pending():
                        break
                    context.iteration(False)
                scene.tick()
                for peer_id, receiver in receivers.items():
                    for _ in range(128):
                        try:
                            index, candidate = receiver.ice.get_nowait()
                        except queue.Empty:
                            break
                        camera["on_ice"](
                            {
                                "peerId": peer_id,
                                "candidate": candidate,
                                "sdpMLineIndex": index,
                            }
                        )
                while harness.pending:
                    harness.pending.pop(0)()
                camera["poll_camera_workers"]()
                while not outgoing.empty():
                    kind, body = outgoing.get_nowait()
                    receiver = receivers[body["peerId"]]
                    if kind == "webrtc-answer":
                        receiver.answer(body["sdp"])
                    elif kind == "webrtc-ice-candidate-backend":
                        candidate = body["candidate"]
                        receiver.webrtc.emit(
                            "add-ice-candidate",
                            candidate["sdpMLineIndex"],
                            candidate["candidate"],
                        )
                time.sleep(0.005)

            def until(predicate, seconds=12, errors=0):
                deadline = time.monotonic() + seconds
                while time.monotonic() < deadline:
                    pump()
                    self.assertLessEqual(len(harness.errors), errors)
                    if predicate():
                        self.assertEqual(len(harness.errors), errors)
                        return
                self.fail("camera route native deadline")

            until(
                lambda: all(
                    r.frames() >= 15 and r.frames("audio") >= 15
                    for r in receivers.values()
                )
            )
            directory = cleanup.enter_context(tempfile.TemporaryDirectory())
            local = cleanup.enter_context(
                LocalProbeOwner(
                    service,
                    directory,
                    Policy(24, 60, 2 * 10**9, 3, 12 * 10**9, 10**9, 20, 100000000),
                    enabled=True,
                )
            )
            capability = local.claim()
            receiver_scope = local.bind(
                capability, "first", service.active["first"].token
            )
            # These test observations come from a Gst receiver, not an actual
            # browser. The admission API must retain its declared-only label.
            sequence, origin, next_sample = 0, time.monotonic_ns(), 0
            deadline = time.monotonic() + 4
            while time.monotonic() < deadline:
                pump()
                now = time.monotonic_ns()
                if now >= next_sample:
                    frames = receivers["first"].frames()
                    local.report(
                        receiver_scope,
                        ReceiverSample(
                            sequence, "gst-test-declared", now - origin, frames, frames
                        ),
                    )
                    sequence += 1
                    next_sample = now + 200000000
                    if local.inspect(receiver_scope)["status"] == "ready_for_dry_run":
                        break
            self.assertEqual(
                local.inspect(receiver_scope)["status"], "ready_for_dry_run"
            )
            draft = local.prepare(
                capability, receiver_scope, "native-dry-run", 24, 10**9
            )
            self.assertFalse(draft.dispatch_available)
            self.assertFalse(draft.budget_reserved)
            self.assertFalse(draft.live_authority)
            self.assertFalse((Path(directory) / "journal.json").exists())
            self.assertEqual(
                service.active["first"].owner.last_snapshot["connection_state"],
                "connected",
            )
            self.assertIn(
                service.active["first"].owner.last_snapshot["ice_connection_state"],
                ("connected", "completed"),
            )
            old_slot = service.active["first"]
            old_token = camera["peers"]["first"]["worker_token"]
            before = second.frames()
            camera["on_peer_disconnect"]({"peerId": "first"})
            harness.pending.pop(0)()
            until(lambda: old_slot.done.is_set(), seconds=3)
            self.assertGreater(second.frames(), before)
            with self.assertRaisesRegex(ValueError, "stale"):
                local.recheck(capability, draft)
            replacement = receive("first")
            self.assertNotEqual(camera["peers"]["first"]["worker_token"], old_token)
            old_slot.events.put_nowait(
                ("answer", {"sdp": "stale"}, time.monotonic_ns())
            )
            until(
                lambda: replacement.frames() >= 15 and replacement.frames("audio") >= 15
            )
            fresh_scope = local.bind(
                capability, "first", camera["peers"]["first"]["worker_token"]
            )
            self.assertIsNot(fresh_scope, receiver_scope)
            self.assertEqual(local.directory, directory)
            snapshot = camera["peers"]["first"]["worker_snapshot"]
            self.assertEqual(snapshot["negotiated_fps"], 30)
            self.assertGreater(snapshot["capture_buffers"], 0)
            self.assertIsNone(scene.game.poll())
            failed_slot = service.active["first"]
            before = second.frames()
            signal.pidfd_send_signal(failed_slot.owner.pidfd, signal.SIGKILL)
            until(lambda: "first" not in camera["peers"], seconds=3, errors=1)
            until(lambda: second.frames() > before + 10, seconds=3, errors=1)
            self.assertIsNone(scene.game.poll())
            slots = list(service.active.values())
            camera["disconnect"]()
            harness.pending.pop(0)()
            until(lambda: all(s.done.is_set() for s in slots), seconds=3, errors=1)
            self.assertEqual(camera["peers"], {})
            self.assertTrue(all(s.cleanup_ok and s.owner.exit_code == 0 for s in slots))
            self.assertTrue(service.close())
            self.assertIsNone(scene.game.poll())


if __name__ == "__main__":
    unittest.main()
