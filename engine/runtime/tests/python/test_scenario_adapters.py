"""Independent arithmetic and fake native/Gst ownership boundaries; no pressure run."""

import ast
import signal
import sys
import tempfile
import unittest
from dataclasses import replace
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from camera_trace_hooks import HostTraceBinding
from scenario_harness import (
    Budget,
    LinuxCameraRuntime,
    Resource,
    RunPlan,
    RuntimeLease,
    ScenarioRunner,
    Timeline,
    WorkloadDeclaration,
    evaluate_effect,
)
from scenario_harness.camera_runtime import cpu_allocation
from scenario_harness.contracts import PHASES, SECOND, Execution, PhaseExecution, RunFailure
from scenario_harness.pressure import LinuxProcesses, PressureWorkers


def plan(workers=1):
    return RunPlan(
        "run-1", "host_contention" if workers else "healthy", 7, (30 * SECOND,) * 6, workers
    )


def execution(healthy=900, degraded=720, recovery=900, cpu=18 * SECOND, workers=1):
    # Independently specified Step 2 totals, apportioned without rounded FPS inputs.
    phases = []
    cursor = 0
    frames = 0
    for phase in PHASES:
        count = {"healthy": healthy, "degraded": degraded, "recovery": recovery}.get(phase, 900)
        active = workers if phase in ("degraded", "probe") else 0
        owned = cpu if active else 0
        rows = tuple(
            (
                cursor + i * SECOND,
                cursor + (i + 1) * SECOND,
                frames + count * i // 30,
                frames + count * (i + 1) // 30,
                active,
                owned * (i + 1) // 30 - owned * i // 30,
            )
            for i in range(30)
        )
        phases.append(PhaseExecution(phase, cursor, cursor + 30 * SECOND, "complete", None, rows))
        cursor += 30 * SECOND
        frames += count
    return Execution(
        "completed",
        None,
        tuple(phases),
        60 * SECOND if workers else None,
        120 * SECOND if workers else None,
        120 * SECOND if workers else None,
        120 * SECOND if workers else None,
        "restored",
        None,
        180 * SECOND,
        180 * SECOND,
        (),
    )


class EffectTests(unittest.TestCase):
    def test_independent_nominal_and_inclusive_boundary(self):
        effect = evaluate_effect(plan(), execution())
        self.assertEqual(
            (
                effect.state,
                effect.reason,
                effect.healthy_fps,
                effect.degraded_fps,
                effect.recovery_fps,
                effect.pressure_cpu_percent,
            ),
            ("verified", None, 30.0, 24.0, 30.0, 60.0),
        )
        effect = evaluate_effect(plan(), execution(degraded=855, recovery=855, cpu=15 * SECOND))
        self.assertEqual(effect.state, "verified")
        self.assertEqual(
            (effect.degraded_fps, effect.recovery_fps, effect.pressure_cpu_percent),
            (28.5, 28.5, 50.0),
        )

    def test_all_fixed_failure_predicates_and_priority(self):
        for values, expected in [
            ({"healthy": 780, "cpu": 0, "degraded": 900, "recovery": 0}, "baseline_inadequate"),
            ({"cpu": 12 * SECOND, "degraded": 900, "recovery": 0}, "pressure_not_observed"),
            ({"degraded": 900, "recovery": 0}, "degradation_not_observed"),
            ({"recovery": 810}, "recovery_not_observed"),
        ]:
            with self.subTest(expected=expected):
                result = evaluate_effect(plan(), execution(**values))
                self.assertEqual((result.state, result.reason), ("failed", expected))

    def test_one_integer_unit_outside_boundary_fails(self):
        for values, expected in [
            ({"cpu": 15 * SECOND - 1}, "pressure_not_observed"),
            ({"degraded": 856}, "degradation_not_observed"),
            ({"recovery": 854}, "recovery_not_observed"),
        ]:
            self.assertEqual(evaluate_effect(plan(), execution(**values)).reason, expected)

    def test_healthy_needs_all_three_throughputs_and_zero_workers(self):
        self.assertEqual(
            evaluate_effect(plan(0), execution(degraded=810, recovery=810, workers=0)).state,
            "verified",
        )
        self.assertEqual(
            evaluate_effect(plan(0), execution(degraded=809, workers=0)).reason,
            "degradation_not_observed",
        )
        self.assertEqual(
            evaluate_effect(plan(0), execution(degraded=900, recovery=809, workers=0)).reason,
            "recovery_not_observed",
        )
        self.assertEqual(evaluate_effect(plan(0), execution()).reason, "insufficient_evidence")

    def test_unavailable_precedence_and_no_fabricated_values(self):
        run = replace(execution(), status="aborted", cleanup_state="unverified")
        for available, expected in [(False, "adapter_unavailable"), (True, "incomplete_run")]:
            result = evaluate_effect(plan(), run, adapter_available=available)
            self.assertEqual(result.reason, expected)
            self.assertIsNone(result.healthy_fps)
        self.assertEqual(
            evaluate_effect(plan(), replace(execution(), cleanup_state="unverified")).reason,
            "cleanup_unverified",
        )

    def test_bad_prefix_gap_counter_capacity_and_worker_evidence(self):
        run = execution()
        degraded = run.phases[2]
        row = degraded.intervals[0]
        for rows in [
            ((), *degraded.intervals[1:]),
            degraded.intervals[:29],
            ((row[0] + 1, *row[1:]), *degraded.intervals[1:]),
            ((row[0], row[1], row[2], row[2] - 1, *row[4:]), *degraded.intervals[1:]),
            ((*row[:4], 0, row[5]), *degraded.intervals[1:]),
            ((*row[:5], SECOND + 1), *degraded.intervals[1:]),
        ]:
            altered = replace(degraded, intervals=rows)
            self.assertEqual(
                evaluate_effect(
                    plan(), replace(run, phases=(*run.phases[:2], altered, *run.phases[3:]))
                ).reason,
                "insufficient_evidence",
            )

    def test_multiple_workers_cpu_percent_can_exceed_one_core(self):
        effect = evaluate_effect(plan(2), execution(cpu=45 * SECOND, workers=2))
        self.assertEqual((effect.state, effect.pressure_cpu_percent), ("verified", 150.0))


class Clock:
    value = 0

    def __call__(self):
        return self.value


class Processes:
    def __init__(self):
        self.next = 100
        self.live = {}
        self.signals = []
        self.reaped = []
        self.closed = []
        self.fail_handshake = None
        self.ignore_term = False
        self.ignore_kill = False
        self.activation_check = lambda: None

    def spawn(self, duration):
        self.next += 1
        self.live[self.next] = dict(
            boot="0" * 8 + "-" + "0" * 4 + "-" + "0" * 4 + "-" + "0" * 4 + "-" + "0" * 12,
            start=self.next,
            cpu=0,
            exited=False,
        )
        return SimpleNamespace(pid=self.next)

    def pin(self, pid):
        if pid not in self.live:
            raise ProcessLookupError()
        return pid

    def identity(self, pid):
        value = self.live[pid]
        return value["boot"], value["start"], value["cpu"]

    def exited(self, fd):
        return self.live[fd]["exited"]

    def handshake(self, child, expected, budget):
        budget.check()
        if child.pid == self.fail_handshake:
            raise RunFailure("action_failed")

    def activate(self, child):
        self.activation_check()

    def send(self, fd, sig):
        self.signals.append((fd, sig))
        if (sig == signal.SIGTERM and not self.ignore_term) or (
            sig == signal.SIGKILL and not self.ignore_kill
        ):
            self.live[fd]["exited"] = True

    def pause(self, budget):
        budget.check()
        budget.timeline.clock.value += SECOND // 10

    def reap(self, child, budget):
        budget.check()
        if child is not None:
            self.reaped.append(child.pid)

    def close(self, fd):
        self.closed.append(fd)


class WorkerTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.lease = RuntimeLease(self.directory.name).__enter__()
        self.resources = tuple(Resource("pressure", f"{i:032x}", "a" * 32) for i in (1, 2))
        self.lease.begin(plan(2), self.resources)
        self.processes = Processes()
        self.manager = PressureWorkers(self.lease, self.resources, self.processes)
        self.clock = Clock()
        self.budget = Budget(Timeline(self.clock), 10 * SECOND)

    def tearDown(self):
        self.lease.__exit__()
        self.directory.cleanup()

    def start(self):
        self.manager.start(70 * SECOND, self.budget)

    def test_all_durable_parked_identities_precede_first_activation(self):
        def check():
            for resource in self.resources:
                self.assertIn(self.lease.worker_record(resource)["state"], ("parked", "active"))
                path = Path(self.directory.name, "worker-" + resource.token + ".json")
                self.assertEqual(path.stat().st_mode & 0o777, 0o600)

        self.processes.activation_check = check
        self.start()
        self.processes.live[101]["cpu"] = 3 * SECOND
        self.processes.live[102]["cpu"] = 4 * SECOND
        self.assertEqual(self.manager.counters(), (2, 7 * SECOND))
        self.assertTrue(self.manager.stop(self.budget))
        self.assertEqual(self.manager.counters(), (0, 7 * SECOND))
        signals = list(self.processes.signals)
        self.assertTrue(self.manager.stop(self.budget))
        self.assertEqual(self.processes.signals, signals)
        self.assertEqual(self.processes.reaped, [102, 101])

    def test_term_escalates_to_kill_with_bounded_reap(self):
        self.start()
        self.processes.ignore_term = True
        self.assertTrue(self.manager.stop(self.budget))
        self.assertEqual(
            self.processes.signals,
            [
                (102, signal.SIGTERM),
                (102, signal.SIGKILL),
                (101, signal.SIGTERM),
                (101, signal.SIGKILL),
            ],
        )
        self.assertLessEqual(self.clock.value, 3 * SECOND)

    def test_stuck_child_retains_record_and_fails_by_deadline(self):
        self.start()
        self.processes.ignore_term = self.processes.ignore_kill = True
        self.assertFalse(self.manager.stop(self.budget))
        self.assertLessEqual(self.clock.value, 10 * SECOND + SECOND // 10)
        self.assertEqual(self.lease.worker_record(self.resources[1])["state"], "active")

    def test_partial_startup_keeps_exact_child_for_cleanup(self):
        self.processes.fail_handshake = 102
        with self.assertRaises(RunFailure):
            self.start()
        self.assertTrue(self.manager.stop(self.budget))
        self.assertEqual(set(self.processes.reaped), {101, 102})

    def test_persist_failure_never_activates_and_still_reaps_child(self):
        with (
            patch.object(self.lease, "worker_record", side_effect=OSError("disk full")),
            self.assertRaises(OSError),
        ):
            self.start()
        self.assertEqual(self.processes.live, {})  # failure reading intent before spawn
        original = self.lease.worker_record

        def fail_write(resource, value=None):
            if value is not None:
                raise OSError("disk full")
            return original(resource)

        with (
            patch.object(self.lease, "worker_record", side_effect=fail_write),
            self.assertRaises(OSError),
        ):
            self.start()
        self.assertTrue(self.manager.stop(self.budget))
        self.assertEqual(self.processes.reaped, [101])

    def test_restarted_manager_recovers_durable_exact_workers(self):
        self.start()
        recovered = PressureWorkers(self.lease, self.resources, self.processes)
        self.assertTrue(recovered.stop(self.budget))
        self.assertEqual({pid for pid, _ in self.processes.signals}, {101, 102})

    def test_foreign_pid_generation_never_signalled_attempts_other_child(self):
        self.start()
        self.processes.live[102]["start"] += 1
        recovered = PressureWorkers(self.lease, self.resources, self.processes)
        self.assertFalse(recovered.stop(self.budget))
        self.assertEqual(self.processes.signals, [(101, signal.SIGTERM)])
        self.assertIn(102, self.processes.closed)

    def test_unexpected_exit_aborts_counters_but_exact_child_can_be_reaped(self):
        self.start()
        self.processes.live[101]["exited"] = True
        self.assertTrue(self.manager.owns(self.resources[0]))
        with self.assertRaises(RunFailure):
            self.manager.counters()
        self.assertTrue(self.manager.stop(self.budget))
        self.assertIn(101, self.processes.reaped)

    def test_missing_native_pid_is_restored_without_signal(self):
        self.start()
        del self.processes.live[102]
        recovered = PressureWorkers(self.lease, self.resources, self.processes)
        self.assertTrue(recovered.restore(self.resources[1], self.budget))
        self.assertEqual(self.processes.signals, [])

    def test_duplicate_invalid_private_record_and_clean_lease_fail_closed(self):
        resource = self.resources[0]
        path = Path(self.directory.name, "worker-" + resource.token + ".json")
        path.write_text('{"pid":1,"pid":2}')
        path.chmod(0o600)
        with self.assertRaises(ValueError):
            self.manager.owns(resource)
        path.unlink()
        self.start()
        with self.assertRaises(ValueError):
            self.start()
        self.assertTrue(self.manager.stop(self.budget))
        self.lease.finish(True)
        with self.assertRaises(ValueError):
            self.manager.owns(resource)

    def test_declared_stop_is_not_native_restoration_proof_after_restart(self):
        self.start()
        resource = self.resources[0]
        self.lease.worker_record(
            resource, dict(self.lease.worker_record(resource), state="stopped")
        )
        recovered = PressureWorkers(self.lease, self.resources, self.processes)
        with self.assertRaises(RunFailure):
            recovered.counters()
        self.assertTrue(recovered.restore(resource, self.budget))
        self.assertEqual(self.processes.signals, [(101, signal.SIGTERM)])

    def test_clean_next_run_prunes_only_prior_bounded_native_inventory(self):
        self.start()
        self.assertTrue(self.manager.stop(self.budget))
        self.lease.finish(True)
        next_resources = (Resource("pressure", "f" * 32, "e" * 32),)
        self.lease.begin(plan(), next_resources)
        self.assertEqual(list(Path(self.directory.name).glob("worker-*.json")), [])


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


class Element:
    def __init__(self, name, properties=None):
        self.name = name
        self.properties = properties or {}

    def get_factory(self):
        return SimpleNamespace(get_name=lambda: self.name)

    def get_property(self, name):
        return self.properties.get(name, 1)

    def get_static_pad(self, name):
        return SimpleNamespace(
            get_current_caps=lambda: SimpleNamespace(
                get_structure=lambda index: SimpleNamespace(
                    get_fraction=lambda field: (True, 30, 1),
                    get_value=lambda field: {"width": 1280, "height": 720}[field],
                )
            )
        )


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


class NativeIdleIntegrationTests(unittest.TestCase):
    @unittest.skipUnless(sys.platform == "linux", "Linux pidfd integration only")
    def test_actual_parked_child_eof_and_reap_without_pressure_activation(self):
        processes = LinuxProcesses()
        child = processes.spawn(40 * SECOND)
        timeline = Timeline(__import__("time").monotonic_ns)
        budget = Budget(timeline, timeline.now() + 2 * SECOND)
        fd = processes.pin(child.pid)
        try:
            processes.handshake(child, b"READY\n", budget)
            boot, start, cpu = processes.identity(child.pid)
            self.assertTrue(boot)
            self.assertGreater(start, 0)
            self.assertGreaterEqual(cpu, 0)
            child.stdin.close()  # No GO is ever sent.
            child.wait(timeout=1)
            self.assertTrue(processes.exited(fd))
        finally:
            if child.poll() is None:
                processes.send(fd, signal.SIGKILL)
                child.wait(timeout=1)
            child.stdout.close()
            processes.close(fd)


if __name__ == "__main__":
    unittest.main()
