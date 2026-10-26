"""Contained synthetic engineering dispatch through the actual camera-worker path."""

import json
import queue
import signal
import sys
import tempfile
import time
import unittest
from contextlib import ExitStack
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from live_probe_control.camera_workers import CameraWorkers
from live_probe_control.contracts import Policy
from live_probe_control.controller import CadenceController
from live_probe_control.game_scene import GameScene
from live_probe_control.local_owner import LocalProbeOwner, ReceiverSample
from live_probe_control.probe_transport import EngineeringControl
from test_live_probe_peer_native import NATIVE, Receiver

SECOND = 10**9
POLICY = Policy(24, 60, 2 * SECOND, 2, 8 * SECOND, SECOND, 20, 500000000)
PROFILE = {"id": "balanced", "fps": 30, "bitrate_kbps": 1500}


@unittest.skipUnless(
    NATIVE, "requires explicitly enabled disposable Linux native runtime"
)
class DispatchNativeTests(unittest.TestCase):
    def setUp(self):
        self.cleanup = ExitStack()
        self.addCleanup(self.cleanup.close)
        self.scene = GameScene()
        self.cleanup.callback(lambda: self.assertTrue(self.scene.close()))
        self.scene.start()
        import gi

        gi.require_version("Gst", "1.0")
        gi.require_version("GstWebRTC", "1.0")
        gi.require_version("GstSdp", "1.0")
        from gi.repository import GLib, Gst, GstSdp, GstWebRTC

        Gst.init(None)
        self.Gst, self.rtc, self.sdp = Gst, GstWebRTC, GstSdp
        self.context = GLib.MainContext.default()
        self.directory = self.cleanup.enter_context(tempfile.TemporaryDirectory())
        self.config = EngineeringControl.open(self.directory, POLICY)
        self.service = CameraWorkers(
            PROFILE, "[]", 2, source="isolated_synthetic", control=self.config
        )
        self.cleanup.callback(lambda: self.assertTrue(self.service.close()))
        self.local = self.cleanup.enter_context(
            LocalProbeOwner(self.service, self.directory, POLICY, enabled=True)
        )
        self.owner = self.local.claim()
        self.receivers = {}
        self.failed = []
        self.cadences = []
        self.handle = None
        self.feed = True
        self.add_peer("first")
        self.add_peer("second")
        self.until(
            lambda: all(
                r.frames() >= 20 and r.frames("audio") >= 20
                for r in self.receivers.values()
            )
        )
        self.bind_first()
        self.until(
            lambda: self.local.inspect(self.handle)["status"] == "ready_for_dry_run"
        )

    def add_peer(self, peer_id):
        receiver = Receiver(self.Gst, self.rtc, self.sdp)
        self.cleanup.callback(receiver.close)
        self.receivers[peer_id] = receiver
        self.service.start(peer_id, receiver.offer())

    def bind_first(self):
        self.handle = self.local.bind(
            self.owner, "first", self.service.active["first"].token
        )
        self.sequence, self.origin, self.next_sample = 0, time.monotonic_ns(), 0

    def pump(self):
        for _ in range(32):
            if not self.context.pending():
                break
            self.context.iteration(False)
        self.scene.tick()
        for peer_id, receiver in self.receivers.items():
            if (
                peer_id not in self.service.active
                or self.service.active[peer_id].done.is_set()
            ):
                continue
            for _ in range(128):
                try:
                    index, candidate = receiver.ice.get_nowait()
                except queue.Empty:
                    break
                self.service.ice(peer_id, index, candidate)
        for peer_id, _token, kind, body, _received in self.service.poll():
            receiver = self.receivers[peer_id]
            if kind == "answer":
                receiver.answer(body["sdp"])
            elif kind == "ice":
                receiver.webrtc.emit(
                    "add-ice-candidate", body["index"], body["candidate"]
                )
            elif kind == "failed":
                self.failed.append(peer_id)
            elif kind == "snapshot" and peer_id == "first":
                self.cadences.append(body["configured_fps"])
        now = time.monotonic_ns()
        if self.handle is not None and self.feed and now >= self.next_sample:
            # Declared engineering observations from a native Gst sink, not a
            # claim of authenticated browser playback or qualified quality.
            frames = self.receivers["first"].frames()
            self.local.report(
                self.handle,
                ReceiverSample(
                    self.sequence, "declared-gst", now - self.origin, frames, frames
                ),
            )
            self.sequence += 1
            self.next_sample = now + 150000000
        time.sleep(0.005)

    def until(self, predicate, seconds=6):
        deadline = time.monotonic() + seconds
        while time.monotonic() < deadline:
            self.pump()
            if predicate():
                return
        details = [
            (
                p,
                s.failure,
                getattr(s.owner, "reason", None),
                getattr(s.owner, "exit_code", None),
            )
            for p, s in self.service.active.items()
        ]
        self.fail(f"engineering transport deadline: {details}")

    def journal(self):
        return json.loads((Path(self.directory) / "journal.json").read_text())

    def dispatch(self, request_id, duration=SECOND):
        draft = self.local.prepare(self.owner, self.handle, request_id, 24, duration)
        operation = self.local.dispatch(self.owner, draft)
        self.assertIs(self.local.dispatch(self.owner, draft), operation)
        return operation

    def ready_after_cooldown(self):
        self.until(
            lambda: (
                time.monotonic_ns() >= self.journal()["cooldown_until_ns"]
                and self.local.inspect(self.handle)["status"] == "ready_for_dry_run"
            )
        )

    def test_complete_cancel_and_replacement_cannot_reset_budget(self):
        sibling = self.receivers["second"].frames()
        operation = self.dispatch("complete")
        self.until(operation.done.is_set)
        self.assertEqual(operation.status, "observed")
        self.assertEqual(operation.result.outcome, "completed")
        self.assertEqual(operation.result.restoration, "verified_by_port")
        self.assertIn(24, self.cadences)
        self.assertFalse(operation.live_authority)
        self.assertEqual(self.journal()["actions"], 1)
        self.assertEqual(self.journal()["reserved_ns"], 3 * SECOND)
        self.ready_after_cooldown()
        cancelled = self.dispatch("cancel", 2 * SECOND)
        self.until(
            lambda: (
                self.service.active["first"].owner.last_snapshot["configured_fps"] == 24
            )
        )
        self.local.cancel(self.owner, cancelled)
        self.until(cancelled.done.is_set)
        self.assertEqual(cancelled.result.reason, "cancelled")
        self.assertEqual(cancelled.result.restoration, "verified_by_port")
        self.assertEqual(self.journal()["actions"], 2)
        self.assertEqual(self.journal()["reserved_ns"], 7 * SECOND)
        self.ready_after_cooldown()
        old = self.service.active["first"]
        self.feed = False
        self.service.retire("first")
        self.until(old.done.is_set)
        self.add_peer("first")
        self.until(lambda: self.receivers["first"].frames() >= 20)
        self.bind_first()
        self.feed = True
        self.until(
            lambda: self.local.inspect(self.handle)["status"] == "ready_for_dry_run"
        )
        refused = self.dispatch("after-replacement")
        self.until(refused.done.is_set)
        self.assertEqual(refused.status, "rejected")
        self.assertIsNone(refused.result)
        self.assertEqual(self.journal()["actions"], 2)
        self.assertEqual(self.journal()["reserved_ns"], 7 * SECOND)
        self.assertEqual(self.journal()["state"], "clean")
        self.assertGreater(self.receivers["second"].frames(), sibling + 50)
        self.assertIsNone(self.scene.game.poll())
        self.assertEqual(self.failed, [])

    def recover(self):
        before = self.journal()
        with CadenceController(
            self.directory,
            POLICY,
            SimpleNamespace(dedicated_process=True),
            enabled=True,
        ) as controller:
            self.assertTrue(controller.recover_after_teardown())
            after = controller.store.journal
            self.assertEqual(after["actions"], before["actions"])
            self.assertEqual(after["reserved_ns"], before["reserved_ns"])
            self.assertEqual(
                after["history"][0]["result"]["restoration"], "not_verified_teardown"
            )

    def test_receiver_loss_retains_dirty_intent_and_supervisor_tears_down_one_worker(
        self,
    ):
        operation = self.dispatch("receiver-loss", 2 * SECOND)
        self.until(
            lambda: (
                self.service.active["first"].owner.last_snapshot["configured_fps"] == 24
            )
        )
        self.feed = False
        sibling = self.receivers["second"].frames()
        self.until(operation.done.is_set)
        self.assertEqual(operation.result.restoration, "unknown")
        self.assertEqual(self.journal()["state"], "dirty")
        first = self.service.active["first"]
        self.until(first.done.is_set)
        self.assertEqual(first.owner.exit_code, -signal.SIGKILL)
        after_teardown = self.receivers["second"].frames()
        self.until(
            lambda: self.receivers["second"].frames() > after_teardown + 20, seconds=2
        )
        self.assertGreater(self.receivers["second"].frames(), sibling + 20)
        self.assertIsNone(self.scene.game.poll())
        self.recover()

    def test_stopped_worker_has_no_fabricated_result_and_recovers_after_exact_teardown(
        self,
    ):
        operation = self.dispatch("blocked-worker")
        self.until(
            lambda: (
                self.service.active["first"].owner.last_snapshot["configured_fps"] == 24
            )
        )
        self.feed = False
        first = self.service.active["first"]
        sibling = self.receivers["second"].frames()
        signal.pidfd_send_signal(first.owner.pidfd, signal.SIGSTOP)
        self.until(first.done.is_set)
        self.assertEqual(operation.status, "worker_lost")
        self.assertIsNone(operation.result)
        self.assertEqual(first.owner.exit_code, -signal.SIGKILL)
        self.assertEqual(self.journal()["state"], "active")
        self.assertEqual(self.journal()["reserved_ns"], 3 * SECOND)
        after_teardown = self.receivers["second"].frames()
        self.until(
            lambda: self.receivers["second"].frames() > after_teardown + 20, seconds=2
        )
        self.assertGreater(self.receivers["second"].frames(), sibling + 20)
        self.assertIsNone(self.scene.game.poll())
        self.recover()


if __name__ == "__main__":
    unittest.main()
