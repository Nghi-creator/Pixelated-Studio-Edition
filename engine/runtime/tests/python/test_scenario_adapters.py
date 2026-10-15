"""Camera hook availability, generation ownership and restoration with fake Gst."""

import ast
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from camera_trace_hooks import HostTraceBinding
from scenario_adapter_support import Clock, Element, Processes, plan
from scenario_harness import (
    Budget,
    LinuxCameraRuntime,
    RuntimeLease,
    ScenarioRunner,
    Timeline,
    WorkloadDeclaration,
    evaluate_effect,
)
from scenario_harness.camera_runtime import cpu_allocation
from scenario_harness.contracts import (
    PHASES,
    SECOND,
)


class AdapterTests(unittest.TestCase):
    def test_current_non_linux_host_is_explicitly_unavailable(self):
        runtime = LinuxCameraRuntime(
            SimpleNamespace(), "private-peer", None, WorkloadDeclaration("workload-1", 7, "24.0.0")
        )
        with patch("scenario_harness.camera_runtime.sys.platform", "darwin"):
            result = runtime.preflight(plan(), Budget(Timeline(Clock()), SECOND))
        self.assertEqual(
            (result.state, result.reason, result.runtime),
            ("unavailable", "runtime_unavailable", ()),
        )
        with self.assertRaises(ValueError):
            runtime.prepare(plan())

    def test_allocation_observes_ancestor_quota_and_fails_closed(self):
        files = {
            "/proc/self/cgroup": "0::/parent/child\n",
            "/sys/fs/cgroup/cpu.max": "max 100000",
            "/sys/fs/cgroup/parent/cpu.max": "200000 100000",
            "/sys/fs/cgroup/parent/child/cpu.max": "400000 100000",
        }
        with (
            patch("os.sched_getaffinity", return_value=set(range(8)), create=True),
            patch.object(Path, "exists", return_value=True),
            patch.object(Path, "read_text", lambda path: files[str(path)]),
        ):
            self.assertEqual(cpu_allocation(), 2)
            files["/sys/fs/cgroup/parent/cpu.max"] = "50000 100000"
            with self.assertRaises(ValueError):
                cpu_allocation()

    def test_declaration_does_not_coerce_seeds_or_versions(self):
        for args in [
            ("workload-0", 7, "24.0.0"),
            ("workload-1", True, "24.0.0"),
            ("workload-1", 7, "024.0.0"),
        ]:
            with self.assertRaises(ValueError):
                WorkloadDeclaration(*args)


class CameraAdapterTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.lease = RuntimeLease(self.directory.name).__enter__()
        self.clock = Clock()
        self.frame_fraction = 0
        self.active_processes = None
        self.encoder = Element("vp8enc")
        self.source = Element("ximagesrc", {"display-name": ":99"})
        self.transport = Element(
            "webrtcbin", {"connection-state": SimpleNamespace(value_nick="connected")}
        )
        self.audio = Element("pulsesrc", {"device": "auto_null.monitor"})
        self.elements = dict(
            video_encoder=self.encoder, video_capture=self.source, sendrecv=self.transport
        )

        def iterate():
            rows = iter([("ok", self.audio), ("done", None)])
            return SimpleNamespace(next=lambda: next(rows))

        self.pipeline = SimpleNamespace(
            get_state=lambda timeout: ("success", "playing", "void"),
            get_by_name=lambda name: self.elements.get(name),
            iterate_elements=iterate,
        )
        binding = HostTraceBinding.__new__(HostTraceBinding)
        binding.closed = False
        self.peer = dict(
            pipeline=self.pipeline,
            stage_trace=binding,
            frames_out_total=0,
            stream_profile={"fps": 30, "bitrate": 1},
        )
        self.calls = []

        def control(peer_id, config):
            self.calls.append("control")
            created = SimpleNamespace(
                start_phase=lambda phase: self.calls.append(("start", phase)),
                finish_phase=lambda phase: self.calls.append(("finish", phase)) or phase,
                close=lambda reason: self.calls.append("close") or True,
            )
            self.peer["stage_trace"] = created
            return created

        self.camera = SimpleNamespace(
            peers={"private-peer": self.peer},
            Gst=SimpleNamespace(
                State=SimpleNamespace(PLAYING="playing", VOID_PENDING="void"),
                IteratorResult=SimpleNamespace(OK="ok", DONE="done"),
                version=lambda: (1, 24, 2, 0),
            ),
            create_peer_recording_control=control,
        )
        self.runtime = LinuxCameraRuntime(
            self.camera, "private-peer", self.lease, WorkloadDeclaration("workload-1", 7, "24.0.0")
        )
        self.patches = [
            patch("scenario_harness.camera_runtime.sys.platform", "linux"),
            patch("scenario_harness.camera_runtime.cpu_allocation", return_value=2),
            patch("scenario_harness.camera_runtime.time.sleep", side_effect=self.sleep),
        ]
        for context in self.patches:
            context.start()

    def tearDown(self):
        for context in reversed(self.patches):
            context.stop()
        self.lease.__exit__()
        self.directory.cleanup()

    def sleep(self, seconds):
        elapsed = max(1, round(seconds * SECOND))
        self.clock.value += elapsed
        active = (
            []
            if self.active_processes is None
            else [
                value
                for value in self.active_processes.live.values()
                if value.get("activated") and not value["exited"]
            ]
        )
        for value in active:
            value["cpu"] += elapsed * 3 // 5
        self.frame_fraction += elapsed * (24 if active else 30)
        frames, self.frame_fraction = divmod(self.frame_fraction, SECOND)
        self.peer["frames_out_total"] += frames

    def preflight(self, value=None):
        return self.runtime.preflight(value or plan(0), Budget(Timeline(self.clock), 2 * SECOND))

    def test_actual_hook_adapter_healthy_runner_and_fixed_effect(self):
        self.assertEqual(self.preflight().state, "available")
        self.assertEqual(dict(self.runtime.availability.runtime)["gst_version"], "1.24.2")
        self.assertEqual(self.calls, [])  # Read-only: no recording, children or setting mutation.
        result = ScenarioRunner(self.lease, self.runtime, self.clock).run(plan(0))
        self.assertEqual(result.status, "completed")
        self.assertEqual(evaluate_effect(plan(0), result).state, "verified")
        self.assertEqual(self.runtime.frozen_recordings, [(phase, phase) for phase in PHASES[1:5]])
        self.assertEqual(self.lease.journal["state"], "clean")

    def test_context_managed_caps_borrow_is_released_on_success_and_rejection(self):
        for width in (1280, 640):
            with self.subTest(width=width):
                calls = []

                class Borrow:
                    def __enter__(inner):
                        calls.append("enter")

                        def field(name, width=width):
                            self.assertEqual(calls, ["enter"])
                            return {"width": width, "height": 720}[name]

                        return SimpleNamespace(
                            get_fraction=lambda name: (True, 30, 1), get_value=field
                        )

                    def __exit__(inner, *exc):
                        calls.append("exit")

                caps = SimpleNamespace(get_structure=lambda index: Borrow())
                self.encoder.get_static_pad = lambda name, caps=caps: SimpleNamespace(
                    get_current_caps=lambda: caps
                )
                if width == 1280:
                    self.runtime._snapshot()
                else:
                    with self.assertRaises(ValueError):
                        self.runtime._snapshot()
                self.assertEqual(calls, ["enter", "exit"])

    def test_peer_generation_and_configuration_drift_fail_closed(self):
        self.assertEqual(self.preflight().state, "available")
        self.encoder.properties["target-bitrate"] = 99
        with self.assertRaises(ValueError):
            self.runtime.counters()
        self.encoder.properties.clear()
        self.camera.peers["private-peer"] = dict(self.peer)
        with self.assertRaises(ValueError):
            self.runtime.counters()

    def test_concrete_contention_hooks_use_owned_cpu_and_restore_before_recovery(self):
        native_check = SimpleNamespace(
            pin=lambda pid: 1, close=lambda fd: None, identity=lambda pid: ("boot", 1, 0)
        )
        processes = Processes()
        self.active_processes = processes
        processes.activate = lambda child: processes.live[child.pid].update(activated=True)
        with (
            patch("scenario_harness.camera_runtime.LinuxProcesses", return_value=native_check),
            patch("scenario_harness.pressure.LinuxProcesses", return_value=processes),
        ):
            self.assertEqual(self.preflight(plan()).state, "available")
            result = ScenarioRunner(self.lease, self.runtime, self.clock).run(plan())
        self.assertEqual(result.status, "completed")
        effect = evaluate_effect(plan(), result)
        self.assertEqual(
            (
                effect.state,
                effect.healthy_fps,
                effect.degraded_fps,
                effect.recovery_fps,
                effect.pressure_cpu_percent,
            ),
            ("verified", 30.0, 24.0, 30.0, 60.0),
        )
        self.assertEqual(processes.reaped, [101])
        self.assertLessEqual(result.action_cleanup_ended_ns, result.phases[4].start_ns)

    def test_no_progress_wrong_transport_or_codec_unavailable_without_control(self):
        for failure in ("transport", "codec", "progress", "owner"):
            with self.subTest(failure=failure):
                self.clock.value = 0
                self.runtime.peer = None
                self.transport.properties["connection-state"].value_nick = "connected"
                self.encoder.name = "vp8enc"
                self.peer["stage_trace"].control_owner = None
                if failure == "transport":
                    self.transport.properties["connection-state"].value_nick = "connecting"
                elif failure == "codec":
                    self.encoder.name = "h264enc"
                elif failure == "owner":
                    self.peer["stage_trace"].control_owner = object()
                with patch.object(
                    self.runtime, "_snapshot", wraps=self.runtime._snapshot
                ) as snapshot:
                    if failure == "progress":
                        frozen = self.runtime._snapshot()
                        snapshot.side_effect = lambda frozen=frozen: frozen
                    self.assertEqual(self.preflight().reason, "source_unavailable")
                self.assertEqual(self.calls, [])

    def test_preflight_plan_and_durable_intent_cannot_be_replaced(self):
        self.assertEqual(self.preflight().state, "available")
        with self.assertRaises(ValueError):
            self.runtime.prepare(plan(1))
        resources = self.runtime.prepare(plan(0))
        with self.assertRaises(ValueError):
            self.runtime.open(plan(0), resources, Budget(Timeline(self.clock), 2 * SECOND))
        self.assertEqual(self.calls, [])

    def test_peer_disconnect_aborts_before_false_effect(self):
        self.assertEqual(self.preflight().state, "available")
        original = self.runtime.wait_until

        def disconnect(deadline, budget):
            original(deadline, budget)
            self.transport.properties["connection-state"].value_nick = "disconnected"

        with patch.object(self.runtime, "wait_until", side_effect=disconnect):
            result = ScenarioRunner(self.lease, self.runtime, self.clock).run(plan(0))
        self.assertEqual(result.status, "aborted")
        self.assertEqual(evaluate_effect(plan(0), result).reason, "incomplete_run")

    def test_recording_ownership_change_after_preflight_is_not_cleaned_by_guess(self):
        self.assertEqual(self.preflight().state, "available")
        resources = self.runtime.prepare(plan(0))
        self.peer["stage_trace"].control_owner = object()
        recording = next(r for r in resources if r.kind == "recording")
        self.assertFalse(self.runtime.owns(recording))
        self.assertFalse(self.runtime.restore(recording, Budget(Timeline(self.clock), 2 * SECOND)))
        self.assertEqual(self.calls, [])

    def test_retired_camera_callbacks_cannot_count_into_replacement_peer(self):
        tree = ast.parse(Path(__file__).resolve().parents[2].joinpath("camera.py").read_text())
        callbacks = [
            node
            for node in ast.walk(tree)
            if isinstance(node, ast.FunctionDef)
            and node.name in ("count_frame_in", "count_frame_out", "count_queue_drop")
        ]
        original = dict(frames_in_total=0, frames_out_total=0, frames_dropped_total=0)
        peers = {"same-private-peer": original}
        namespace = dict(
            peers=peers,
            peer_id="same-private-peer",
            owned_peer=original,
            Gst=SimpleNamespace(PadProbeReturn=SimpleNamespace(OK="ok")),
        )
        # Execute only the actual repository's isolated callbacks, without GI/server startup.
        exec(compile(ast.Module(body=callbacks, type_ignores=[]), "camera.py", "exec"), namespace)  # noqa: S102
        namespace["count_frame_in"](None, None)
        namespace["count_frame_out"](None, None)
        namespace["count_queue_drop"](None)
        self.assertEqual(tuple(original.values()), (1, 1, 1))
        peers["same-private-peer"] = dict(
            frames_in_total=0, frames_out_total=0, frames_dropped_total=0
        )
        namespace["count_frame_in"](None, None)
        namespace["count_frame_out"](None, None)
        namespace["count_queue_drop"](None)
        self.assertEqual(tuple(peers["same-private-peer"].values()), (0, 0, 0))


if __name__ == "__main__":
    unittest.main()
