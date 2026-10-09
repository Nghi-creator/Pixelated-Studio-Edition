"""Stdlib tests for bounded opt-in collection, independent of GI and the core."""

import json
import sys
import threading
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from camera_trace import HostTraceRecording
from camera_trace_config import ENGINE_EVENTS, SAFE_MAX, TraceConfig, parse_trace_config


class Clock:
    def __init__(self):
        self.value = 0

    def __call__(self):
        self.value += 1000000
        return self.value


def create(config=None):
    manager = HostTraceRecording(config or TraceConfig(), clock=Clock(), resolution_ns=1)
    return manager, manager.begin()


def snapshot(manager):
    manager.finish()
    return manager.snapshot("a" * 40, "synthetic")


def full_frame(manager, stream, pts):
    manager.capture(stream, pts)
    for boundary in ENGINE_EVENTS[1:]:
        manager.endpoint(stream, boundary, pts)


class ConfigTests(unittest.TestCase):
    def test_default_disabled_does_not_parse_trace_only_knobs(self):
        self.assertIsNone(parse_trace_config({"PIXELATED_STAGE_TRACE_BUDGET_NS": "private"}))
        self.assertIsNone(parse_trace_config({"PIXELATED_STAGE_TRACE": "0"}))

    def test_opt_in_validates_every_knob(self):
        config = parse_trace_config(
            {
                "PIXELATED_STAGE_TRACE": "1",
                "PIXELATED_STAGE_TRACE_EVERY_NTH_FRAME": "3",
                "PIXELATED_STAGE_TRACE_MAX_FRAMES": "2",
                "PIXELATED_STAGE_TRACE_MAX_EVENTS": "5",
                "PIXELATED_STAGE_TRACE_BUDGET_NS": "12000000",
            }
        )
        self.assertEqual(config, TraceConfig(3, 2, 5, 12000000))
        for key, value in [
            ("PIXELATED_STAGE_TRACE", "true"),
            ("PIXELATED_STAGE_TRACE_MAX_FRAMES", "2001"),
            ("PIXELATED_STAGE_TRACE_MAX_EVENTS", "10001"),
            ("PIXELATED_STAGE_TRACE_EVERY_NTH_FRAME", "0"),
            ("PIXELATED_STAGE_TRACE_BUDGET_NS", "-1"),
            ("PIXELATED_STAGE_TRACE_BUDGET_NS", "1e6"),
            ("PIXELATED_STAGE_TRACE_BUDGET_NS", str(SAFE_MAX + 1)),
            ("PIXELATED_STAGE_TRACE_BUDGET_NS", "9" * 100),
        ]:
            with self.subTest(key=key, value=value), self.assertRaises(ValueError):
                parse_trace_config({"PIXELATED_STAGE_TRACE": "1", key: value})

    def test_boolean_and_invalid_direct_configuration_rejected(self):
        for kwargs in [
            {"max_frames": True},
            {"budget_ns": False},
            {"max_events": 0},
            {"every_nth_frame": 1001},
        ]:
            with self.subTest(kwargs=kwargs), self.assertRaises(ValueError):
                TraceConfig(**kwargs)


class CollectorTests(unittest.TestCase):
    def test_nominal_boundaries_and_monotonic_identity(self):
        manager, stream = create(TraceConfig(budget_ns=12000000))
        full_frame(manager, stream, 123)
        data = snapshot(manager)["streams"][0]
        self.assertEqual(
            data["frames"], [{"frame_id": "frame-1", "source_sequence": 1, "correlation": "exact"}]
        )
        self.assertEqual([e["boundary"] for e in data["events"]], list(ENGINE_EVENTS))
        self.assertEqual(
            [e["timestamp_ns"] for e in data["events"]],
            [1000000, 2000000, 3000000, 4000000, 5000000],
        )
        self.assertEqual(data["loss"]["attempted_events"], 5)
        self.assertNotIn("123", json.dumps(data))

    def test_sampling_frame_and_event_capacities(self):
        manager, stream = create(TraceConfig(every_nth_frame=3, max_frames=2, max_events=6))
        for pts in range(10):
            full_frame(manager, stream, pts)
        data = snapshot(manager)["streams"][0]
        self.assertEqual([f["source_sequence"] for f in data["frames"]], [1, 4])
        loss = data["loss"]
        self.assertEqual(
            (
                loss["offered_frames"],
                loss["sampled_frames"],
                loss["unsampled_frames"],
                loss["frame_capacity_dropped"],
            ),
            (10, 2, 6, 2),
        )
        self.assertEqual(
            (loss["attempted_events"], loss["retained_events"], loss["event_capacity_dropped"]),
            (10, 6, 4),
        )
        self.assertEqual(len(stream.pts_frames), 2)
        self.assertLessEqual(len(stream.seen_endpoints), 8)

    def test_missing_pts_does_not_fabricate_downstream_pairing(self):
        for pts in [None, -1, 2**64 - 1, True]:
            with self.subTest(pts=pts):
                manager, stream = create()
                full_frame(manager, stream, pts)
                data = snapshot(manager)["streams"][0]
                self.assertEqual(data["frames"][0]["correlation"], "missing")
                self.assertEqual(len(data["events"]), 1)

    def test_duplicate_pts_invalidates_both_frames_without_refilling(self):
        manager, stream = create(TraceConfig(max_events=6))
        full_frame(manager, stream, 50)
        full_frame(manager, stream, 50)
        full_frame(manager, stream, 60)
        data = snapshot(manager)["streams"][0]
        self.assertEqual(
            [f["correlation"] for f in data["frames"]], ["ambiguous", "ambiguous", "exact"]
        )
        self.assertEqual([e["sequence"] for e in data["events"]], [1, 6])
        self.assertEqual(data["loss"]["event_correlation_dropped"], 4)
        self.assertEqual(data["loss"]["event_capacity_dropped"], 5)
        self.assertEqual(data["loss"]["attempted_events"], 11)

    def test_unsampled_duplicate_also_invalidates_sampled_frame(self):
        manager, stream = create(TraceConfig(every_nth_frame=2))
        full_frame(manager, stream, 50)
        full_frame(manager, stream, 50)
        data = snapshot(manager)["streams"][0]
        self.assertEqual(data["frames"][0]["correlation"], "ambiguous")
        self.assertEqual(len(data["events"]), 1)
        self.assertEqual(data["loss"]["unsampled_frames"], 1)

    def test_regressing_pts_and_unknown_downstream_do_not_guess(self):
        manager, stream = create()
        full_frame(manager, stream, 50)
        full_frame(manager, stream, 40)
        manager.endpoint(stream, "encode_output", 999)
        data = snapshot(manager)["streams"][0]
        self.assertEqual(data["frames"][1]["correlation"], "missing")
        self.assertEqual(len(data["events"]), 6)

    def test_duplicate_endpoint_is_ambiguous_not_first_matching_buffer(self):
        manager, stream = create()
        full_frame(manager, stream, 50)
        manager.endpoint(stream, "encode_output", 50)
        data = snapshot(manager)["streams"][0]
        self.assertEqual(data["frames"][0]["correlation"], "ambiguous")
        self.assertEqual(data["loss"]["event_correlation_dropped"], 4)
        self.assertEqual(len(data["events"]), 1)

    def test_invalid_clock_closes_scope_with_exact_event_loss(self):
        def raising():
            raise RuntimeError("clock failed")

        for clock in [lambda: -1, lambda: SAFE_MAX + 10000000, raising]:
            with self.subTest(clock=clock):
                manager, stream = create()
                manager.clock = clock
                manager.capture(stream, 50)
                manager.endpoint(stream, "encode_input", 50)
                data = snapshot(manager)["streams"][0]
                self.assertEqual(data["loss"]["attempted_events"], 1)
                self.assertEqual(data["loss"]["event_invalid_timestamp_dropped"], 1)
                self.assertEqual(data["stop_reason"], "source_error")
                self.assertEqual(data["events"], [])

    def test_clock_regression_cannot_pair_across_a_reset(self):
        manager, stream = create()
        manager.capture(stream, 50)
        manager.clock = lambda: stream.origin + 500000
        manager.endpoint(stream, "encode_input", 50)
        manager.endpoint(stream, "encode_output", 50)
        data = snapshot(manager)["streams"][0]
        self.assertEqual(data["stop_reason"], "source_error")
        self.assertEqual(len(data["events"]), 1)
        self.assertEqual(data["loss"]["event_invalid_timestamp_dropped"], 1)

    def test_shutdown_is_idempotent_and_snapshots_detach(self):
        manager, stream = create()
        manager.capture(stream, 1)
        manager.stop(stream, "shutdown")
        manager.endpoint(stream, "encode_output", 1)
        manager.capture(stream, 2)
        manager.stop(stream, "completed")
        data = snapshot(manager)
        self.assertEqual(data["streams"][0]["stop_reason"], "shutdown")
        data["streams"][0]["frames"][0]["correlation"] = "private"
        self.assertEqual(
            manager.snapshot("a" * 40)["streams"][0]["frames"][0]["correlation"], "exact"
        )
        self.assertIsNone(manager.begin())

    def test_global_caps_cover_peers_and_restarts(self):
        manager, first = create(TraceConfig(max_frames=2, max_events=6))
        second = manager.begin()
        full_frame(manager, first, 50)
        full_frame(manager, second, 50)
        manager.stop(first)
        third = manager.begin()
        full_frame(manager, third, 50)
        data = snapshot(manager)["streams"]
        self.assertEqual([s["epoch_id"] for s in data], ["epoch-1", "epoch-2", "epoch-3"])
        self.assertEqual(sum(len(s["frames"]) for s in data), 2)
        self.assertEqual(sum(len(s["events"]) for s in data), 6)
        self.assertEqual(data[2]["loss"]["frame_capacity_dropped"], 1)

    def test_lifetime_and_snapshot_preconditions(self):
        manager, _ = create()
        for _ in range(15):
            manager.begin()
        self.assertIsNone(manager.begin())
        with self.assertRaises(ValueError):
            manager.snapshot("a" * 40)
        manager.finish()
        for version in ["private", "a" * 39, "A" * 40]:
            with self.assertRaises(ValueError):
                manager.snapshot(version)

    def test_multithreaded_callbacks_conserve_counts(self):
        manager, first = create()
        second = manager.begin()

        def collect(stream):
            for pts in range(100):
                full_frame(manager, stream, pts)

        threads = [threading.Thread(target=collect, args=(s,)) for s in [first, second]]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=5)
            self.assertFalse(thread.is_alive())
        data = snapshot(manager)["streams"]
        self.assertEqual(sum(s["loss"]["offered_frames"] for s in data), 200)
        self.assertEqual(sum(s["loss"]["retained_events"] for s in data), 1000)
        self.assertEqual([len(s["frames"]) for s in data], [100, 100])


if __name__ == "__main__":
    unittest.main()
