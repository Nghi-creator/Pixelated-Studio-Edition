"""Fake pad integration verifies lifecycle and buffer flow without claiming real timing."""

import sys
import types
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from camera_trace import HostTraceRecording
from camera_trace_config import TraceConfig
from camera_trace_hooks import LOCATIONS, install_host_trace, install_trace_shutdown
from test_camera_trace import Clock, create, snapshot

GST = types.SimpleNamespace(
    PadProbeType=types.SimpleNamespace(BUFFER=1, EVENT_DOWNSTREAM=2, EVENT_FLUSH=4),
    PadProbeReturn=types.SimpleNamespace(OK="OK"),
    EventType=types.SimpleNamespace(SEGMENT="SEGMENT", FLUSH_START="FLUSH_START"),
    BufferFlags=types.SimpleNamespace(DISCONT=1),
)


class Pad:
    def __init__(self):
        self.callbacks = {}
        self.fail_add = False
        self.fail_remove = False

    def add_probe(self, mask, callback):
        if self.fail_add:
            raise RuntimeError("registration failed")
        self.mask = mask
        number = len(self.callbacks) + 1
        self.callbacks[number] = callback
        return number

    def remove_probe(self, number):
        if self.fail_remove:
            raise RuntimeError("removal failed")
        self.callbacks.pop(number, None)

    def deliver(self, info):
        return [callback(self, info) for callback in list(self.callbacks.values())]

    def segment(self, number):
        event = types.SimpleNamespace(type="SEGMENT", get_seqnum=lambda: number)
        return self.deliver(types.SimpleNamespace(type=2, get_event=lambda: event))

    def flush(self):
        event = types.SimpleNamespace(type="FLUSH_START")
        return self.deliver(types.SimpleNamespace(type=2, get_event=lambda: event))

    def buffer(self, pts, discont=False):
        buffer = types.SimpleNamespace(pts=pts, has_flags=lambda _flag: discont)
        return self.deliver(types.SimpleNamespace(type=1, get_buffer=lambda: buffer))


class Pipeline:
    def __init__(self):
        self.pads = {(element, pad): Pad() for element, pad, _ in LOCATIONS}

    def get_by_name(self, name):
        return types.SimpleNamespace(get_static_pad=lambda pad: self.pads.get((name, pad)))

    def pad(self, boundary):
        element, pad, _ = next(location for location in LOCATIONS if location[2] == boundary)
        return self.pads[(element, pad)]

    def segments(self, number):
        for pad in self.pads.values():
            pad.segment(number)

    def frame(self, pts):
        for pad in self.pads.values():
            if pad.buffer(pts) != ["OK"]:
                raise AssertionError("probe changed media flow")


def binding():
    manager = HostTraceRecording(TraceConfig(), clock=Clock(), resolution_ns=1)
    pipeline = Pipeline()
    return manager, pipeline, install_host_trace(pipeline, manager, GST)


class HookTests(unittest.TestCase):
    def test_signal_shutdown_is_opt_in_and_quits_the_loop(self):
        self.assertIsNone(install_trace_shutdown(None, None, None))
        registered, quit_calls = [], []
        glib = types.SimpleNamespace(
            PRIORITY_DEFAULT=0, unix_signal_add=lambda *args: registered.append(args) or 42
        )
        loop = types.SimpleNamespace(quit=lambda: quit_calls.append(True))
        manager, _ = create()
        self.assertEqual(install_trace_shutdown(manager, glib, loop), 42)
        self.assertFalse(registered[0][2]())
        self.assertEqual(quit_calls, [True])

    def test_disabled_path_does_not_inspect_pipeline(self):
        self.assertIsNone(install_host_trace(None, None, None))

    def test_installs_exact_five_hooks_and_preserves_flow(self):
        manager, pipeline, hooks = binding()
        pipeline.segments(10)
        pipeline.frame(50)
        self.assertEqual(len(hooks.probes), 5)
        self.assertTrue(all(p.mask == 7 for p in pipeline.pads.values()))
        hooks.close()
        data = snapshot(manager)["streams"][0]
        self.assertEqual(len(data["events"]), 5)
        self.assertEqual(data["stop_reason"], "shutdown")
        self.assertTrue(all(not p.callbacks for p in pipeline.pads.values()))
        hooks.close()

    def test_teardown_preserves_existing_telemetry_probe(self):
        manager = HostTraceRecording(TraceConfig(), clock=Clock(), resolution_ns=1)
        pipeline = Pipeline()
        sink = pipeline.pad("pre_encode_queue_enter")
        legacy_calls = []

        def legacy(_pad, info):
            if info.type == 1:
                legacy_calls.append(True)
            return "OK"

        legacy_id = sink.add_probe(1, legacy)
        hooks = install_host_trace(pipeline, manager, GST)
        pipeline.segments(10)
        for pad in pipeline.pads.values():
            self.assertTrue(all(result == "OK" for result in pad.buffer(50)))
        hooks.close()
        self.assertEqual(list(sink.callbacks), [legacy_id])
        self.assertEqual(sink.buffer(60), ["OK"])
        self.assertEqual(len(legacy_calls), 2)
        self.assertEqual(len(snapshot(manager)["streams"][0]["events"]), 5)

    def test_resets_have_distinct_epochs_and_ignore_old_queued_buffers(self):
        manager, pipeline, hooks = binding()
        pipeline.segments(10)
        pipeline.frame(50)
        source = pipeline.pad("capture_output")
        source.segment(20)
        source.buffer(50)
        pipeline.pad("encode_output").buffer(50)  # previous segment: cannot join new source
        for boundary in [
            "pre_encode_queue_enter",
            "pre_encode_queue_exit",
            "encode_input",
            "encode_output",
        ]:
            pipeline.pad(boundary).segment(20)
            pipeline.pad(boundary).buffer(50)
        hooks.close()
        data = snapshot(manager)["streams"]
        self.assertEqual([s["epoch_id"] for s in data], ["epoch-1", "epoch-2"])
        self.assertEqual([len(s["events"]) for s in data], [5, 5])
        self.assertEqual(data[1]["loss"]["attempted_events"], 5)

    def test_flush_closes_old_scope_before_next_segment(self):
        manager, pipeline, hooks = binding()
        pipeline.segments(10)
        pipeline.frame(50)
        pipeline.pad("capture_output").flush()
        pipeline.frame(60)
        pipeline.segments(20)
        pipeline.frame(50)
        hooks.close()
        self.assertEqual([len(s["frames"]) for s in snapshot(manager)["streams"]], [1, 1])

    def test_unannounced_discontinuity_pauses_until_new_segment(self):
        manager, pipeline, hooks = binding()
        pipeline.segments(10)
        pipeline.pad("capture_output").buffer(50, discont=True)  # first-buffer flag is normal
        pipeline.pad("capture_output").buffer(60, discont=True)
        pipeline.frame(70)
        pipeline.segments(20)
        pipeline.frame(50)
        hooks.close()
        self.assertEqual([len(s["frames"]) for s in snapshot(manager)["streams"]], [1, 1])

    def test_reused_segment_key_never_bridges_resets(self):
        manager, pipeline, hooks = binding()
        pipeline.segments(10)
        pipeline.frame(50)
        pipeline.segments(10)
        pipeline.frame(60)
        hooks.close()
        data = snapshot(manager)["streams"]
        self.assertEqual(len(data), 1)
        self.assertEqual(len(data[0]["frames"]), 1)
        self.assertEqual(data[0]["stop_reason"], "source_error")

    def test_missing_pad_rolls_back_without_probes_or_supported_stream(self):
        manager, _ = create()
        pipeline = Pipeline()
        del pipeline.pads[("video_encoder", "src")]
        with self.assertRaises(ValueError):
            install_host_trace(pipeline, manager, GST)
        self.assertTrue(all(not p.callbacks for p in pipeline.pads.values()))

    def test_partial_registration_is_removed_and_does_not_allocate_stream(self):
        manager = HostTraceRecording(TraceConfig(), clock=Clock(), resolution_ns=1)
        pipeline = Pipeline()
        pipeline.pad("encode_output").fail_add = True
        with self.assertRaises(RuntimeError):
            install_host_trace(pipeline, manager, GST)
        self.assertEqual(manager.streams, [])
        self.assertTrue(all(not p.callbacks for p in pipeline.pads.values()))

    def test_probe_failures_never_change_media_flow(self):
        manager, pipeline, hooks = binding()
        pipeline.segments(10)
        broken_info = types.SimpleNamespace(type=1, get_buffer=lambda: 123)
        self.assertEqual(pipeline.pad("capture_output").deliver(broken_info), ["OK"])
        pipeline.frame(50)
        hooks.close()
        data = snapshot(manager)["streams"][0]
        self.assertEqual(data["stop_reason"], "source_error")
        self.assertEqual(data["frames"], [])

    def test_remove_failure_can_retry_and_closed_callback_is_noop(self):
        manager, pipeline, hooks = binding()
        pipeline.segments(10)
        pipeline.frame(50)
        source = pipeline.pad("capture_output")
        source.fail_remove = True
        hooks.close()
        self.assertEqual(source.buffer(60), ["OK"])
        source.fail_remove = False
        hooks.close()
        self.assertEqual(source.callbacks, {})
        self.assertEqual(len(snapshot(manager)["streams"][0]["frames"]), 1)

    def test_lifetime_limit_removes_new_installation(self):
        manager, _ = create()
        for _ in range(15):
            manager.begin()
        pipeline = Pipeline()
        self.assertIsNone(install_host_trace(pipeline, manager, GST))
        self.assertTrue(all(not p.callbacks for p in pipeline.pads.values()))


if __name__ == "__main__":
    unittest.main()
