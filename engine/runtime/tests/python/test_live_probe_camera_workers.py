"""Exercise main-loop adapter and real camera callback bodies without GI."""

import ast
import sys
import threading
import time
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from camera_protocol import normalize_ice_candidate, normalize_peer_id, validate_offer
from camera_state import write_encoder_telemetry
from live_probe_control.camera_workers import CameraWorkers, Slot, workers_enabled
from live_probe_control.receiver_bridge import valid_bound, valid_report

PROFILE = {"id": "balanced", "fps": 30, "bitrate_kbps": 1500}


class Owner:
    def __init__(self, *, enabled, gate=None):
        self.state, self.pending, self.events = "new", {}, []
        self.gate = gate
        self.entered = threading.Event()
        self.closed = threading.Event()
        self.offers = []
        self.candidates = []

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()

    def start(self, *_args, **_kwargs):
        self.entered.set()
        if self.gate is not None and not self.gate.wait(2):
            raise ValueError("test startup deadline")
        self.state = "ready"

    def offer(self, sdp):
        self.offers.append(sdp)
        self.state = "playing"
        self.events.append({"kind": "answer", "body": {"sdp": "answer"}})

    def ice(self, index, candidate):
        self.candidates.append((index, candidate))

    def poll(self):
        values, self.events = self.events, []
        return values

    def shutdown(self):
        self.state = "closed"

    def close(self):
        self.state = "closed"
        self.closed.set()
        return True


class AdapterTests(unittest.TestCase):
    def service(self, *, maximum=2, gate=None):
        self.owners = []

        def factory(**kwargs):
            owner = Owner(**kwargs, gate=gate)
            self.owners.append(owner)
            return owner

        service = CameraWorkers(PROFILE, "[]", maximum, factory=factory)
        self.addCleanup(lambda: self.assertTrue(service.close()))
        return service

    def wait_for(self, service, predicate):
        deadline = time.monotonic() + 1
        while time.monotonic() < deadline:
            events = service.poll()
            if predicate(events):
                return events
            time.sleep(0.005)
        self.fail("adapter deadline")

    def test_opt_in_is_closed_and_conflicts_explicit(self):
        self.assertFalse(workers_enabled({}))
        self.assertTrue(workers_enabled({"PIXELATED_DEDICATED_PEER_WORKERS": "1"}))
        for extra in (
            {"PIXELATED_STAGE_TRACE": "1"},
            {"PIXELATED_N5_CAMPAIGN_DIRECTORY": "/private"},
            {"PIXELATED_DEDICATED_PEER_WORKERS": "true"},
        ):
            with self.assertRaises(ValueError):
                workers_enabled({"PIXELATED_DEDICATED_PEER_WORKERS": "1", **extra})
        self.assertFalse(workers_enabled({"PIXELATED_STAGE_TRACE": "1"}))

    def test_startup_and_retire_do_not_wait_on_native_work(self):
        gate = threading.Event()
        self.addCleanup(gate.set)
        service = self.service(maximum=1, gate=gate)
        before = time.monotonic()
        token = service.start("peer", "offer")
        self.assertLess(time.monotonic() - before, 0.2)
        self.assertTrue(service.active["peer"].owner.entered.wait(0.5))
        service.ice("peer", 0, "early-candidate")
        self.assertEqual(service.start("peer", "offer"), token)
        with self.assertRaises(ValueError):
            service.start("peer", "changed")
        before = time.monotonic()
        service.retire("peer")
        self.assertLess(time.monotonic() - before, 0.1)
        with self.assertRaises(ValueError):
            service.start("replacement", "offer")
        gate.set()
        self.assertTrue(service.retired[0].done.wait(1))
        service.poll()
        self.assertEqual(service.retired, [])
        self.assertEqual(self.owners[0].offers, [])

    def test_early_ice_answer_and_replacement_have_fresh_token(self):
        service = self.service()
        token = service.start("peer", "offer")
        service.ice("peer", 0, "early")
        self.wait_for(service, lambda events: any(e[2] == "answer" for e in events))
        self.assertEqual(self.owners[0].offers, ["offer"])
        self.wait_for(service, lambda _: bool(self.owners[0].candidates))
        slot = service.active["peer"]
        service.retire("peer")
        self.assertTrue(slot.done.wait(1))
        fresh = service.start("peer", "new-offer")
        self.assertNotEqual(fresh, token)
        slot.events.put_nowait(("answer", {"sdp": "stale"}, time.monotonic_ns()))
        events = self.wait_for(service, lambda values: bool(values))
        self.assertTrue(all(e[1] == fresh for e in events))

    def test_expired_main_loop_lease_cannot_be_revived_by_poll(self):
        service = self.service()
        slot = Slot("peer", "offer", seen_ns=time.monotonic_ns() - 4000000000)
        service.active["peer"] = slot
        events = service.poll()
        self.assertEqual(events[0][2], "failed")
        self.assertTrue(slot.stop.is_set())
        self.assertEqual(service.poll(), [])
        service.active.clear()  # No thread was allocated for this focused state test.

    def test_full_candidate_queue_retires_instead_of_growing(self):
        service = self.service()
        slot = Slot("peer", "offer", seen_ns=time.monotonic_ns())
        service.active["peer"] = slot
        for _ in range(128):
            service.ice("peer", 0, "candidate")
        with self.assertRaises(ValueError):
            service.ice("peer", 0, "overflow")
        self.assertEqual(slot.inbox.qsize(), 128)
        self.assertTrue(slot.stop.is_set())
        service.active.clear()

    def test_output_queue_overflow_closes_worker(self):
        class Flood(Owner):
            def poll(self):
                return [{"kind": "answer", "body": {"sdp": "answer"}}] * 65

        service = CameraWorkers(PROFILE, "[]", 1, factory=Flood)
        self.addCleanup(service.close)
        service.start("peer", "offer")
        slot = service.active["peer"]
        self.assertTrue(slot.done.wait(1))
        self.assertEqual(slot.events.qsize(), 64)
        self.assertTrue(slot.cleanup_ok)
        self.assertEqual(service.poll()[0][2], "failed")

    def test_constructor_rejects_invalid_ice_before_threads(self):
        with self.assertRaises(ValueError):
            CameraWorkers(PROFILE, '[{"urls":"https://wrong"}]', 2)

    def test_factory_failure_reports_fixed_failure_and_finishes(self):
        def fail(**_):
            raise RuntimeError("private detail")

        service = CameraWorkers(PROFILE, "[]", 1, factory=fail)
        self.addCleanup(service.close)
        service.start("peer", "offer")
        self.assertTrue(service.active["peer"].done.wait(1))
        self.assertEqual(service.poll()[0][2], "failed")
        self.assertTrue(service.active["peer"].cleanup_ok)


class CameraCallbacks(unittest.TestCase):
    def namespace(self):
        tree = ast.parse(
            (Path(__file__).resolve().parents[2] / "camera.py").read_text()
        )
        names = {
            "handle_offer",
            "poll_camera_workers",
            "cleanup_peer",
            "publish_encoder_telemetry",
            "on_ice",
            "on_offer",
            "on_receiver_bound",
            "on_receiver_observation",
            "on_peer_disconnect",
            "disconnect",
        }
        functions = [
            node
            for node in tree.body
            if isinstance(node, ast.FunctionDef) and node.name in names
        ]
        for node in functions:
            node.decorator_list = []
        self.pending, self.sent, self.errors, self.retired = [], [], [], []
        self.events = []
        workers = SimpleNamespace(
            start=lambda p, s: "token",
            retire=self.retired.append,
            ice=lambda *args: self.sent.append(("ice-forward", args)),
            poll=lambda: self.events,
        )
        ns = {
            "RECEIVERS": None,
            "valid_bound": valid_bound,
            "valid_report": valid_report,
            "time": SimpleNamespace(monotonic_ns=lambda: 123),
            "WORKERS": workers,
            "SIGNALING_EPOCH": object(),
            "SIGNALING_CONNECTED": True,
            "peers": {},
            "SESSION_ID": "session",
            "PEER_STATE_PATH": "unused",
            "TELEMETRY_STATE_PATH": "unused",
            "validate_offer": validate_offer,
            "normalize_peer_id": normalize_peer_id,
            "normalize_ice_candidate": normalize_ice_candidate,
            "emit_engine_error": self.errors.append,
            "write_peer_state": lambda *_: None,
            "write_encoder_telemetry": lambda *_: None,
            "sio": SimpleNamespace(emit=lambda *args: self.sent.append(args)),
            "GLib": SimpleNamespace(idle_add=self.pending.append),
        }
        exec(  # noqa: S102 -- execute trusted local callback definitions only
            compile(
                ast.Module(body=functions, type_ignores=[]),
                "trusted-camera-callbacks",
                "exec",
            ),
            ns,
        )
        return ns

    def test_actual_offer_and_snapshot_callbacks_use_worker_path(self):
        ns = self.namespace()
        ns["handle_offer"]({"peerId": "peer", "type": "offer", "sdp": "offer"})
        self.assertEqual(ns["peers"]["peer"]["worker_token"], "token")
        self.events.extend(
            [
                ("peer", "old", "answer", {"sdp": "stale"}, 1),
                ("peer", "token", "answer", {"sdp": "answer"}, 2),
                ("peer", "token", "snapshot", {"capture_buffers": None}, 3),
            ]
        )
        ns["poll_camera_workers"]()
        self.assertEqual(len(self.sent), 1)
        self.assertEqual(self.sent[0][1]["sdp"], "answer")
        self.assertEqual(ns["peers"]["peer"]["worker_snapshot_received_ns"], 3)

    def test_observation_callback_keeps_original_receipt_and_rejects_retired_peer(self):
        ns = self.namespace()
        reports = []
        ns["RECEIVERS"] = SimpleNamespace(
            accept=lambda payload, stamp: reports.append((payload, stamp))
        )
        ns["peers"]["peer"] = {"worker_token": "token"}
        report = {
            "peerId": "peer",
            "bindingId": "a" * 64,
            "offerHash": "b" * 64,
            "receiverSocketId": "receiver",
            "clockId": "clock",
            "sequence": 0,
            "elapsedNs": 0,
            "framesDecoded": 1,
            "presentedFrames": 1,
        }
        ns["on_receiver_observation"](report)
        ns["time"].monotonic_ns = lambda: 999
        self.pending.pop()()
        self.assertEqual(reports, [(report, 123)])
        ns["on_receiver_observation"](report)
        ns["peers"]["peer"] = {"worker_token": "replacement"}
        self.pending.pop()()
        self.assertEqual(len(reports), 1)

    def test_observation_ack_queued_before_signaling_replacement_is_discarded(self):
        ns = self.namespace()
        acknowledgements = []
        ns["RECEIVERS"] = SimpleNamespace(bound=acknowledgements.append)
        ns["on_receiver_bound"](
            {
                "peerId": "peer",
                "bindingId": "a" * 64,
                "offerHash": "b" * 64,
                "receiverSocketId": "receiver",
            }
        )
        ns["SIGNALING_EPOCH"] = object()
        self.pending.pop()()
        self.assertEqual(acknowledgements, [])

    def test_old_connection_cannot_emit_answer_after_reconnect(self):
        ns = self.namespace()
        ns["handle_offer"]({"peerId": "peer", "type": "offer", "sdp": "offer"})
        ns["SIGNALING_EPOCH"] = object()
        self.events.append(("peer", "token", "answer", {"sdp": "old-connection"}, 1))
        ns["poll_camera_workers"]()
        self.assertEqual(self.sent, [])
        self.assertEqual(self.retired, ["peer"])
        self.assertEqual(ns["peers"], {})

    def test_delayed_disconnect_and_ice_cannot_touch_replacement(self):
        ns = self.namespace()
        ns["peers"]["peer"] = {"worker_token": "old"}
        ns["on_peer_disconnect"]({"peerId": "peer"})
        ns["on_ice"]({"peerId": "peer", "candidate": "candidate", "sdpMLineIndex": 0})
        replacement = ns["peers"]["peer"] = {"worker_token": "fresh"}
        for callback in self.pending:
            callback()
        self.assertIs(ns["peers"]["peer"], replacement)
        self.assertEqual(self.sent, [])
        self.assertEqual(self.retired, [])

    def test_disconnect_invalidates_offer_still_queued_on_glib(self):
        ns = self.namespace()
        ns["on_offer"]({"peerId": "peer", "type": "offer", "sdp": "offer"})
        ns["disconnect"]("transport close")
        while self.pending:
            self.pending.pop(0)()
        self.assertEqual(ns["peers"], {})

    def test_peer_disconnect_queued_during_offer_start_does_not_leak_peer(self):
        ns = self.namespace()
        ns["on_offer"]({"peerId": "peer", "type": "offer", "sdp": "offer"})
        ns["on_peer_disconnect"]({"peerId": "peer"})
        while self.pending:
            self.pending.pop(0)()
        self.assertEqual(ns["peers"], {})
        self.assertEqual(self.retired, ["peer"])

    def test_signaling_disconnect_closes_only_captured_peers(self):
        ns = self.namespace()
        ns["peers"].update(
            first={"worker_token": "first"}, second={"worker_token": "second"}
        )
        ns["disconnect"]()
        ns["peers"]["second"] = {"worker_token": "replacement"}
        self.pending.pop()()
        self.assertEqual(self.retired, ["first"])
        self.assertEqual(set(ns["peers"]), {"second"})


class TelemetryTests(unittest.TestCase):
    def payload(self, peers):
        with patch("camera_state.atomic_write_json") as write:
            write_encoder_telemetry("unused", "session", peers)
            return write.call_args.args[1]

    def peer(self, **changes):
        fields = {
            "state": "playing",
            "capture_buffers": 30,
            "encoded_buffers": 29,
            "queue_overruns_total": 1,
            "pre_encoder_queue_level": 0,
            "post_encoder_queue_level": 1,
            "cpu_used": 6,
            "max_quantizer": 48,
            "target_bitrate": 1500000,
            "configured_fps": 30,
        }
        fields.update(changes)
        return {
            "worker_token": "token",
            "worker_snapshot": fields,
            "worker_snapshot_received_ns": time.monotonic_ns(),
        }

    def test_missing_and_stale_worker_metrics_do_not_become_zero(self):
        for peer in (
            {"worker_token": "token"},
            self.peer(capture_buffers=None),
            self.peer(capture_buffers=True),
        ):
            payload = self.payload({"peer": peer})
            self.assertIsNone(payload["framesInTotal"])
        peer = self.peer()
        peer["worker_snapshot_received_ns"] -= 3000000000
        payload = self.payload({"peer": peer})
        self.assertIsNone(payload["framesInTotal"])
        self.assertIsNone(payload["queueLevelBuffers"])
        self.assertIsNone(payload["targetFps"])

    def test_metrics_use_native_values_not_declared_profile(self):
        payload = self.payload({"peer": self.peer(configured_fps=24)})
        self.assertEqual(payload["targetFps"], 24)
        self.assertEqual(payload["targetBitrateKbps"], 1500)
        self.assertEqual(payload["framesOutTotal"], 29)
        self.assertEqual(payload["queueLevelBuffers"], 1)
        self.assertNotIn("read_end_ns", payload)

    def test_partial_aggregate_and_mixed_settings_are_unknown(self):
        payload = self.payload(
            {
                "one": self.peer(),
                "two": self.peer(configured_fps=24, pre_encoder_queue_level=None),
            }
        )
        self.assertEqual(payload["framesInTotal"], 60)
        self.assertIsNone(payload["targetFps"])
        self.assertIsNone(payload["queueLevelBuffers"])

    def test_legacy_queue_getter_failure_is_unknown(self):
        peer = {
            "frames_in_total": 4,
            "frames_out_total": 3,
            "frames_dropped_total": 0,
            "stream_profile": PROFILE,
            "pre_encoder_queue": None,
            "post_encoder_queue": None,
        }
        self.assertIsNone(self.payload({"peer": peer})["queueLevelBuffers"])
        self.assertEqual(self.payload({})["queueLevelBuffers"], 0)


if __name__ == "__main__":
    unittest.main()
