"""Counter-specific timing is additive; outer metadata bounds and old gates stay intact."""

import copy
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[4]))
from qualification.observation import test_resource_condition_observation as resource_fixtures

from live_probes.peers import test_live_probe_peer as peer_fixtures
from research.live_probe_control.peers.peer_protocol import (
    ENCODED_READ_METHOD,
    decode,
    encode,
    event,
    event_body,
)
from research.live_probe_control.peers.peer_worker import PeerMedia


class EncodedReadTests(unittest.TestCase):
    def trace(self):
        return dict(
            method=ENCODED_READ_METHOD, read_start_ns=80000000, read_end_ns=81000000, value=20
        )

    def body(self):
        return dict(
            peer_fixtures.snapshot(141000000), encoded_buffers=20, encoded_counter_read=self.trace()
        )

    def test_new_wire_roundtrip_binds_value_inside_unchanged_outer_bounds(self):
        body = self.body()
        decoded = decode(encode(event(peer_fixtures.bootstrap(), "snapshot", body)))["body"]
        self.assertEqual(decoded, body)
        self.assertEqual(decoded["read_start_ns"], 0)
        self.assertEqual(decoded["read_end_ns"], 141000000)

    def test_legacy_snapshot_shape_remains_allowed_but_old_wire_versions_rejected(self):
        body = peer_fixtures.snapshot()
        self.assertEqual(event_body("snapshot", body), body)
        for version in ("n10-peer-ipc-v1", "n10-peer-ipc-v2", "n10-peer-ipc-v3"):
            message = event(peer_fixtures.bootstrap(), "snapshot", body)
            message["version"] = version
            with self.assertRaises(ValueError):
                decode(encode(message))

    def test_foreign_counter_bad_brackets_and_extra_fields_rejected(self):
        for change in (
            dict(value=21),
            dict(value=True),
            dict(read_start_ns=-1),
            dict(read_end_ns=142000000),
            dict(read_end_ns=79000000),
            dict(method="legacy"),
            dict(unexpected=1),
        ):
            body = self.body()
            body["encoded_counter_read"].update(change)
            with self.subTest(change=change), self.assertRaises(ValueError):
                event_body("snapshot", body)
        for change in (dict(encoded_counter_read=None), dict(encoded_buffers=None)):
            with self.assertRaises(ValueError):
                event_body("snapshot", dict(self.body(), **change))
        body = dict(self.body(), encoded_buffers=None, encoded_counter_read=None)
        self.assertEqual(event_body("snapshot", body), body)

    def media(self, fail_encoded=False):
        clock = [0]
        encoded_get = Mock()

        def counter_get(name):
            def get_value(_key):
                if name == "encoded":
                    encoded_get()
                    clock[0] += 1000000
                    if fail_encoded:
                        raise ValueError("counter unavailable")
                return 20 if name == "encoded" else 10

            return get_value

        def element(name):
            def property_value(prop):
                if prop == "stats":
                    return SimpleNamespace(get_value=counter_get(name))
                if name == "video_encoder":
                    clock[0] += 20000000
                return {
                    "current-level-buffers": 0,
                    "caps": object(),
                    "target-bitrate": 1500000,
                    "cpu-used": 6,
                    "max-quantizer": 48,
                }[prop]

            return SimpleNamespace(
                get_property=property_value,
                get_static_pad=lambda _name: SimpleNamespace(get_current_caps=lambda: object()),
            )

        def state(_timeout):
            clock[0] += 20000000
            return "ok", "playing", "void"

        def connection(_name):
            clock[0] += 30000000
            return SimpleNamespace(value_nick="connected")

        media = PeerMedia.__new__(PeerMedia)
        media.origin = media.overruns = 0
        media.pipeline = SimpleNamespace(get_state=state, get_by_name=element)
        media.webrtc = SimpleNamespace(get_property=connection)
        media.gst = SimpleNamespace(
            StateChangeReturn=SimpleNamespace(FAILURE="failure"),
            State=SimpleNamespace(VOID_PENDING="void", PLAYING="playing", READY="ready"),
        )
        return media, clock, encoded_get

    def test_slow_unrelated_metadata_does_not_retimestamp_or_reread_counter(self):
        media, clock, getter = self.media()
        with (
            patch(
                "research.live_probe_control.peers.peer_worker.time.monotonic_ns",
                side_effect=lambda: clock[0],
            ),
            patch(
                "research.live_probe_control.peers.peer_worker.caps_values",
                return_value=(30, 640, 480),
            ),
        ):
            body = media.snapshot()
        event_body("snapshot", body)
        self.assertEqual(body["read_end_ns"] - body["read_start_ns"], 141000000)
        self.assertEqual(body["encoded_counter_read"], self.trace())
        self.assertEqual(body["encoded_buffers"], 20)
        getter.assert_called_once()

    def test_unavailable_counter_has_no_invented_point_read(self):
        media, clock, getter = self.media(fail_encoded=True)
        with (
            patch(
                "research.live_probe_control.peers.peer_worker.time.monotonic_ns",
                side_effect=lambda: clock[0],
            ),
            patch(
                "research.live_probe_control.peers.peer_worker.caps_values",
                return_value=(30, 640, 480),
            ),
        ):
            body = media.snapshot()
        self.assertIsNone(body["encoded_buffers"])
        self.assertIsNone(body["encoded_counter_read"])
        event_body("snapshot", body)
        getter.assert_called_once()

    def test_resource_evidence_preserves_both_bounds_and_worker_clock(self):
        fixture = resource_fixtures.ResourceConditionTests()
        observer, slot, _, sampler, _ = fixture.observer()
        body = dict(
            read_start_ns=0,
            read_end_ns=141000000,
            encoded_buffers=20,
            encoded_counter_read=self.trace(),
        )
        evidence = observer.native_read_evidence(slot, body)
        self.assertEqual(evidence["native_read"]["read_end_ns"], 141000000)
        self.assertEqual(evidence["encoded_counter_read"]["read_end_ns"], 81000000)
        self.assertEqual(
            evidence["native_read"]["clock_id"], evidence["encoded_counter_read"]["clock_id"]
        )
        self.assertFalse(evidence["encoded_counter_read"]["live_authority"])
        sampler.sample.assert_called_once()

    def test_mismatched_resource_trace_fails_before_cpu_sampling(self):
        fixture = resource_fixtures.ResourceConditionTests()
        observer, slot, _, sampler, _ = fixture.observer()
        bad = copy.deepcopy(self.trace())
        bad["value"] = 21
        with self.assertRaises(ValueError):
            observer.native_read_evidence(
                slot,
                dict(
                    read_start_ns=0,
                    read_end_ns=141000000,
                    encoded_buffers=20,
                    encoded_counter_read=bad,
                ),
            )
        self.assertTrue(observer._resource_failed)
        sampler.sample.assert_not_called()


if __name__ == "__main__":
    unittest.main()
