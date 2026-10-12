"""Fresh actual collectors with fake blocking pads; no live timing claim."""

import ast
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from camera_trace import HostTraceRecording
from camera_trace_config import TraceConfig
from camera_trace_control import PeerRecordingControl
from camera_trace_hooks import install_host_trace
from test_camera_trace import Clock
from test_camera_trace_hooks import GST, LOCATIONS, Pad, Pipeline

CONTROL_GST = types.SimpleNamespace(**vars(GST))
CONTROL_GST.PadProbeType = types.SimpleNamespace(**vars(GST.PadProbeType), IDLE=8)


class BlockingPad(Pad):
    def __init__(self):
        super().__init__()
        self.sequence = 0
        self.idle = True

    def add_probe(self, mask, callback):
        if self.fail_add:
            raise RuntimeError("registration failed")
        self.sequence += 1
        number = self.sequence
        self.callbacks[number] = callback
        if mask == 8:
            self.block = number
            if self.idle:
                callback(self, types.SimpleNamespace(type=8))
        return number

    def remove_probe(self, number):
        super().remove_probe(number)
        if getattr(self, "block", None) == number:
            self.block = None

    def deliver(self, info):
        if getattr(self, "block", None):
            return []  # Actual Gst IDLE probe holds source admission until removal.
        return super().deliver(info)


class BlockingPipeline(Pipeline):
    def __init__(self):
        self.pads = {(element, pad): BlockingPad() for element, pad, _ in LOCATIONS}


def control():
    pipeline = BlockingPipeline()
    clock = Clock()

    def factory(config):
        return HostTraceRecording(config, clock=clock, resolution_ns=1)

    recording = factory(TraceConfig())
    binding = install_host_trace(pipeline, recording, CONTROL_GST)
    pipeline.segments(10)
    pipeline.frame(50)
    return (
        pipeline,
        recording,
        PeerRecordingControl(pipeline, binding, CONTROL_GST, TraceConfig(), factory),
    )


class ControlTests(unittest.TestCase):
    def test_rearm_creates_new_warmup_binding_without_reusing_old_frames(self):
        pipeline, _, owner = control()
        for i, phase in enumerate(("healthy", "degraded", "probe", "recovery")):
            owner.start_phase(phase)
            pipeline.frame(60+i*10)
            owner.finish_phase(phase)
        old = owner.finished[-1][1]
        before = old.snapshot("a"*40,"synthetic")
        self.assertTrue(owner.close())
        binding = owner.rearm()
        pipeline.frame(100)
        self.assertEqual(before,old.snapshot("a"*40,"synthetic"))
        self.assertIsNot(binding.recording,old)
        self.assertFalse(binding.recording.finished)
        self.assertEqual(len(binding.stream.frames),1)
        binding.close()
        binding.recording.finish()
        self.assertTrue(all(not p.callbacks for p in pipeline.pads.values()))

    def test_partial_or_active_recorders_cannot_rearm(self):
        _, _, owner = control()
        with self.assertRaises(ValueError): owner.rearm()
        owner.start_phase("healthy")
        owner.close()
        with self.assertRaises(ValueError): owner.rearm()

    def test_four_fresh_collectors_and_new_clocks_preserve_n4_roots(self):
        pipeline, initial, owner = control()
        for index, phase in enumerate(("healthy", "degraded", "probe", "recovery")):
            recording = owner.start_phase(phase)
            self.assertIsNot(recording, initial)
            pipeline.frame(60 + index * 10)
            owner.finish_phase(phase)
            data = recording.snapshot("a" * 40, "synthetic")
            self.assertEqual(len(data["streams"]), 1)
            self.assertEqual(data["streams"][0]["clock_id"], "clock-1")
            self.assertEqual(len(data["streams"][0]["frames"]), 1)
            self.assertEqual(len(data["streams"][0]["events"]), 5)
        self.assertTrue(initial.finished)
        self.assertEqual(len(owner.finished), 4)
        self.assertTrue(owner.close())
        self.assertTrue(all(not p.callbacks for p in pipeline.pads.values()))

    def test_old_callbacks_and_queued_buffers_cannot_join_new_recording(self):
        pipeline, old, owner = control()
        old_callback = next(iter(pipeline.pad("capture_output").callbacks.values()))
        fresh = owner.start_phase("healthy")
        buffer = types.SimpleNamespace(pts=60, has_flags=lambda _flag: False)
        info = types.SimpleNamespace(type=1, get_buffer=lambda: buffer)
        self.assertEqual(old_callback(None, info), "OK")  # Retired closure is inert.
        for boundary in (
            "pre_encode_queue_enter",
            "pre_encode_queue_exit",
            "encode_input",
            "encode_output",
        ):
            pipeline.pad(boundary).buffer(50)  # Already admitted by previous collector.
        pipeline.frame(50)  # A reused old source PTS cannot create a fresh frame.
        pipeline.frame(60)
        owner.finish_phase("healthy")
        self.assertEqual(len(old.streams[0].frames), 1)
        self.assertEqual(len(fresh.streams[0].frames), 1)
        self.assertEqual(len(fresh.streams[0].events), 5)
        owner.close()

    def test_source_stays_blocked_across_transition_then_resumes(self):
        pipeline, _, owner = control()
        owner.start_phase("healthy")
        pipeline.frame(60)
        owner.finish_phase("healthy")
        source = pipeline.pad("capture_output")
        self.assertTrue(source.block)
        self.assertEqual(source.buffer(70), [])
        fresh = owner.start_phase("degraded")
        self.assertFalse(source.block)
        pipeline.frame(70)
        owner.finish_phase("degraded")
        self.assertEqual(len(fresh.streams[0].frames), 1)
        owner.close()
        self.assertFalse(source.block)

    def test_direct_duplicate_controller_and_partial_install_cleanup_are_safe(self):
        pipeline, _, owner = control()
        with self.assertRaises(ValueError):
            PeerRecordingControl(pipeline, owner.binding, CONTROL_GST, TraceConfig())
        source = pipeline.pad("capture_output")
        last = pipeline.pad("encode_output")

        def fail_after_new_source_probe(*_args):
            source.fail_remove = True
            raise RuntimeError("new downstream registration failed")

        last.add_probe = fail_after_new_source_probe
        with self.assertRaises(RuntimeError):
            owner.start_phase("healthy")
        self.assertEqual(len(owner.failed_bindings), 1)
        self.assertFalse(owner.close())
        source.fail_remove = False
        self.assertTrue(owner.close())
        self.assertTrue(all(not p.callbacks for p in pipeline.pads.values()))

    def test_phase_order_duplicate_ownership_and_closed_controls_fail(self):
        pipeline, _, owner = control()
        with self.assertRaises(ValueError):
            owner.start_phase("probe")
        owner.start_phase("healthy")
        with self.assertRaises(ValueError):
            owner.start_phase("healthy")
        with self.assertRaises(ValueError):
            owner.finish_phase("degraded")
        owner.close()
        with self.assertRaises(ValueError):
            owner.start_phase("degraded")

    def test_registration_and_retirement_failures_are_cleanup_retryable(self):
        for operation in ("add", "remove"):
            with self.subTest(operation=operation):
                pipeline, _, owner = control()
                pad = pipeline.pad("encode_output")
                if operation == "add":
                    pad.fail_add = True
                else:
                    pad.fail_remove = True
                with self.assertRaises((ValueError, RuntimeError)):
                    owner.start_phase("healthy")
                pad.fail_add = pad.fail_remove = False
                self.assertTrue(owner.close())
                self.assertTrue(all(not p.callbacks for p in pipeline.pads.values()))

    def test_missing_admission_evidence_and_barrier_timeout_fail_closed(self):
        pipeline, _, owner = control()
        owner.binding.last_capture_pts = None
        with self.assertRaises(ValueError):
            owner.start_phase("healthy")
        owner.close()
        pipeline, _, owner = control()
        pipeline.pad("capture_output").idle = False
        with patch("camera_trace_control.threading.Event") as event:
            event.return_value.wait.return_value = False
            with self.assertRaises(ValueError):
                owner.start_phase("healthy")
            event.return_value.wait.assert_called_once_with(1.0)
        self.assertTrue(owner.close())

    def test_camera_control_uses_exact_single_peer_and_rejects_second_owner(self):
        tree = ast.parse(
            (Path(__file__).resolve().parents[2] / "camera.py").read_text()
        )
        function = next(
            n
            for n in tree.body
            if isinstance(n, ast.FunctionDef)
            and n.name == "create_peer_recording_control"
        )
        pipeline = BlockingPipeline()
        initial = HostTraceRecording(TraceConfig(), clock=Clock(), resolution_ns=1)
        binding = install_host_trace(pipeline, initial, CONTROL_GST)
        # Use the actual camera function without loading GI/server/playback.
        namespace = {
            "peers": {},
            "PeerRecordingControl": PeerRecordingControl,
            "Gst": CONTROL_GST,
        }
        exec(  # noqa: S102 - trusted local control function AST, no supplied code.
            compile(
                ast.Module(body=[function], type_ignores=[]), "camera-control", "exec"
            ),
            namespace,
        )
        create = namespace["create_peer_recording_control"]
        with self.assertRaises(ValueError):
            create("peer", TraceConfig())
        namespace["peers"]["peer"] = {
            "pipeline": pipeline,
            "stage_trace": binding,
        }
        created = create("peer", TraceConfig())
        self.assertIs(namespace["peers"]["peer"]["stage_trace"], created)
        with self.assertRaises(ValueError):
            create("peer", TraceConfig())
        created.close()


if __name__ == "__main__":
    unittest.main()
