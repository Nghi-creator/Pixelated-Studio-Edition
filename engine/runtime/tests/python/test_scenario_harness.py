"""Fake-clock/runtime lifecycle and actual private lease filesystem regressions."""

import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from scenario_harness import (
    Budget,
    Counters,
    Resource,
    RunPlan,
    RuntimeLease,
    ScenarioRunner,
    Timeline,
)
from scenario_harness.contracts import PHASES, SECOND


class Clock:
    def __init__(self):
        self.value = 0

    def __call__(self):
        return self.value


class Runtime:
    def __init__(self, clock):
        self.clock = self.cleanup_clock = clock
        self.calls = []
        self.workers = 0
        self.frames = self.cpu = 0
        self.resources = None
        self.plan = None
        self.fail = None
        self.foreign = set()
        self.restore_fail = set()
        self.wait_hook = None
        self.prepare_calls = 0

    def prepare(self, plan):
        self.prepare_calls += 1
        self.plan = plan
        self.resources = tuple(
            Resource(kind, f"{index:032x}", "a" * 32)
            for index, kind in enumerate(
                ["workload", "recording"] + ["pressure"] * plan.workers, 1
            )
        )
        return self.resources

    def open(self, plan, resources, budget):
        budget.check()
        self.calls.append(("open", plan.seed))
        if self.fail == "open":
            raise RuntimeError("private details")

    def start_action(self, plan, budget):
        self.calls.append(("start", self.clock()))
        if self.fail == "start":
            raise RuntimeError("startup failed after acquiring a worker")
        self.workers = plan.workers
        return True

    def stop_action(self, budget):
        self.calls.append(("stop", self.clock()))
        if self.fail == "stop":
            return False
        self.workers = 0
        return True

    def start_recording(self, phase, budget):
        self.calls.append(("record", phase))
        if self.fail == "record":
            raise ValueError("no source")

    def finish_recording(self, phase, budget):
        self.calls.append(("freeze", phase))
        if self.fail == "freeze":
            raise OSError("private path")

    def wait_until(self, deadline, budget):
        elapsed = deadline - self.clock.value
        self.clock.value = deadline
        self.frames += elapsed * (24 if self.workers else 30) // SECOND
        self.cpu += elapsed * self.workers * 3 // 5
        if self.wait_hook:
            self.wait_hook(self)

    def counters(self):
        return Counters(self.frames, self.workers, self.cpu)

    def owns(self, resource):
        return resource in self.resources and resource.token not in self.foreign

    def restore(self, resource, budget):
        self.calls.append(("restore", resource.token))
        if resource.kind == "pressure":
            self.workers = 0
        if resource.token in self.restore_fail:
            raise OSError("restore failed")
        return True


def plan(pressure=False):
    return RunPlan(
        "run-1",
        "host_contention" if pressure else "healthy",
        7,
        tuple(value * SECOND for value in (10, 30, 30, 30, 30, 10)),
        1 if pressure else 0,
    )


class HarnessTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        os.chmod(self.temp.name, 0o700)
        self.addCleanup(self.temp.cleanup)
        self.clock = Clock()
        self.runtime = Runtime(self.clock)

    def run_plan(self, pressure=False, cancelled=lambda: False, value=None):
        with RuntimeLease(self.temp.name) as lease:
            runner = ScenarioRunner(lease, self.runtime, self.clock, cancelled)
            execution = runner.run(value or plan(pressure))
            self.assertEqual(
                lease.journal["state"],
                "clean" if execution.cleanup_state == "restored" else "dirty",
            )
        return execution

    def test_healthy_six_phases_and_explicit_postwarmup_recordings(self):
        result = self.run_plan()
        self.assertEqual((result.status, result.reason), ("completed", None))
        self.assertEqual(tuple(p.phase for p in result.phases), PHASES)
        self.assertEqual(result.phases[0].start_ns, 0)
        self.assertEqual(result.phases[-1].end_ns, 140 * SECOND)
        self.assertEqual(
            [p.end_ns - p.start_ns for p in result.phases],
            [d * SECOND for d in (10, 30, 30, 30, 30, 10)],
        )
        self.assertEqual(
            [call[1] for call in self.runtime.calls if call[0] == "record"],
            list(PHASES[1:5]),
        )
        self.assertEqual(self.runtime.calls[0], ("open", 7))
        self.assertIsNone(result.action_started_ns)
        self.assertEqual(result.cleanup_state, "restored")
        self.assertTrue(
            all(i[4:] == (0, 0) for p in result.phases for i in p.intervals)
        )

    def test_pressure_probe_contiguous_and_restored_before_recovery(self):
        result = self.run_plan(True)
        self.assertEqual(result.status, "completed")
        self.assertEqual(result.action_started_ns, 40 * SECOND)
        self.assertEqual(result.action_stopped_ns, 100 * SECOND)
        self.assertLessEqual(result.action_cleanup_ended_ns, result.phases[4].start_ns)
        self.assertEqual(result.phases[2].end_ns, result.phases[3].start_ns)
        self.assertEqual(sum(i[3] - i[2] for i in result.phases[2].intervals), 720)
        self.assertEqual(sum(i[5] for i in result.phases[2].intervals), 18 * SECOND)
        self.assertTrue(all(i[4] == 1 for p in result.phases[2:4] for i in p.intervals))
        self.assertTrue(all(i[4:] == (0, 0) for i in result.phases[4].intervals))

    def test_saturated_cpu_read_latency_is_inside_wall_receipt(self):
        class Saturated(Runtime):
            def start_action(inner, value, budget):
                result = super().start_action(value, budget)
                inner.origin = inner.clock.value
                inner.reads = 0
                return result

            def counters(inner):
                if inner.workers:
                    # Initial read is immediate; subsequent reads take 1 ms while
                    # the single worker continues consuming an entire CPU core.
                    if inner.reads:
                        inner.clock.value += SECOND // 1000
                    inner.reads += 1
                    inner.cpu = inner.clock.value - inner.origin
                return super().counters()

        self.runtime = Saturated(self.clock)
        result = self.run_plan(True)
        self.assertEqual(result.status, "completed")
        intervals = [row for phase in result.phases[2:4] for row in phase.intervals]
        self.assertTrue(all(row[5] == row[1] - row[0] for row in intervals))

    def test_fractional_second_duration_has_no_short_fabricated_interval(self):
        value = RunPlan("run-1", "healthy", 0, (1_100_000_000,) * 6)
        result = self.run_plan(value=value)
        self.assertEqual(result.status, "completed")
        self.assertTrue(all(len(p.intervals) == 1 for p in result.phases))
        self.assertEqual(result.phases[-1].end_ns, 6_600_000_000)

    def test_cancellation_keeps_prefix_and_attempts_every_owned_cleanup(self):
        result = self.run_plan(True, cancelled=lambda: self.clock.value >= 65 * SECOND)
        self.assertEqual((result.status, result.reason), ("aborted", "cancelled"))
        self.assertEqual(result.action_stopped_ns, 65 * SECOND)
        self.assertEqual(result.action_cleanup_started_ns, 65 * SECOND)
        self.assertEqual(result.action_cleanup_ended_ns, 65 * SECOND)
        self.assertEqual([p.phase for p in result.phases], list(PHASES[:3]))
        self.assertEqual(result.phases[-1].state, "partial")
        self.assertEqual(result.phases[-1].end_ns, 65 * SECOND)
        self.assertEqual(result.phases[-1].intervals[-1][1], 64 * SECOND)
        self.assertEqual(len([c for c in self.runtime.calls if c[0] == "restore"]), 3)
        self.assertEqual(self.runtime.workers, 0)

    def test_start_failure_is_not_verified_and_durable_intent_precedes_it(self):
        self.runtime.fail = "start"

        def start(plan, budget):
            journal = json.loads(Path(self.temp.name, "journal.json").read_text())
            self.assertEqual(journal["state"], "active")
            self.assertEqual(len(journal["resources"]), 3)
            raise RuntimeError("failed startup")

        self.runtime.start_action = start
        result = self.run_plan(True)
        self.assertEqual(result.reason, "action_failed")
        self.assertEqual(len(result.phases), 2)
        self.assertIsNotNone(result.action_started_ns)
        self.assertEqual(result.cleanup_state, "restored")

    def test_failed_stop_never_starts_recovery(self):
        self.runtime.fail = "stop"
        result = self.run_plan(True)
        self.assertEqual((result.status, result.reason), ("aborted", "cleanup_failed"))
        self.assertEqual([p.phase for p in result.phases], list(PHASES[:4]))
        self.assertNotIn(("record", "recovery"), self.runtime.calls)

    def test_restore_failure_does_not_skip_other_resources_or_clear_journal(self):
        self.runtime.restore_fail.add(f"{2:032x}")
        result = self.run_plan(True)
        self.assertEqual(result.reason, "cleanup_failed")
        self.assertEqual(result.cleanup_state, "unverified")
        self.assertIn(("restore", f"{1:032x}"), self.runtime.calls)
        with RuntimeLease(self.temp.name) as lease, self.assertRaises(ValueError):
            lease.begin(plan(), self.runtime.resources)

    def test_clock_regression_retains_prefix_and_still_cleans(self):
        def regress(runtime):
            if runtime.clock.value >= 50 * SECOND:
                runtime.clock.value -= 2 * SECOND

        self.runtime.wait_hook = regress
        result = self.run_plan(True)
        self.assertEqual(result.reason, "clock_error")
        self.assertEqual(result.cleanup_state, "restored")
        self.assertEqual(len(result.phases), 3)

    def test_waiting_early_or_overlong_never_passes_complete(self):
        for delta in (-SECOND, 6 * SECOND):
            with self.subTest(delta=delta):
                self.clock.value = 0

                def wait(deadline, budget, delta=delta):
                    self.clock.value = deadline + delta

                self.runtime.wait_until = wait
                result = self.run_plan()
                self.assertEqual(result.status, "aborted")

    def test_duplicate_live_lease_and_runner_reuse_fail_before_mutation(self):
        with RuntimeLease(self.temp.name) as lease:
            with self.assertRaises(BlockingIOError), RuntimeLease(self.temp.name):
                self.fail("duplicate lease acquired")
            runner = ScenarioRunner(lease, self.runtime, self.clock)
            runner.run(plan())
            with self.assertRaises(ValueError):
                runner.run(plan())
            self.assertEqual(self.runtime.prepare_calls, 1)

    def test_restart_recovery_verifies_exact_generation_and_keeps_foreign_resources(
        self,
    ):
        resources = self.runtime.prepare(plan(True))
        with RuntimeLease(self.temp.name) as lease:
            lease.begin(
                plan(True), resources
            )  # Simulate interruption before runtime cleanup.
        with RuntimeLease(self.temp.name) as lease:
            self.runtime.foreign.add(resources[-1].token)
            budget = Budget(Timeline(self.clock), self.clock.value + 10 * SECOND)
            self.assertFalse(lease.recover(self.runtime, budget))
            self.assertNotIn(("restore", resources[-1].token), self.runtime.calls)
            self.assertEqual(lease.journal["state"], "dirty")
            self.runtime.foreign.clear()
            self.assertTrue(lease.recover(self.runtime, budget))
            self.assertEqual(lease.journal["state"], "clean")

    def test_private_directory_symlink_hardlink_and_malformed_journal_rejected(self):
        os.chmod(self.temp.name, 0o755)  # noqa: S103 - deliberate rejection case.
        with self.assertRaises(ValueError), RuntimeLease(self.temp.name):
            pass
        os.chmod(self.temp.name, 0o700)
        target = Path(self.temp.name, "foreign")
        target.write_text("untouched")
        os.chmod(target, 0o600)
        journal = Path(self.temp.name, "journal.json")
        journal.symlink_to(target)
        with self.assertRaises(OSError), RuntimeLease(self.temp.name):
            pass
        self.assertEqual(target.read_text(), "untouched")
        journal.unlink()
        os.link(target, journal)
        with self.assertRaises(ValueError), RuntimeLease(self.temp.name):
            pass
        journal.unlink()
        for text in ('{"version":1,"version":2}', "[]", " " * 65537):
            journal.write_text(text)
            os.chmod(journal, 0o600)
            with self.assertRaises(ValueError), RuntimeLease(self.temp.name):
                pass

    def test_cleanup_deadline_does_not_wait_indefinitely_or_clear_dirty_intent(self):
        def restore(resource, budget):
            self.clock.value += 11 * SECOND
            return True

        self.runtime.restore = restore
        result = self.run_plan()
        self.assertEqual(result.reason, "cleanup_failed")
        self.assertEqual(result.cleanup_state, "unverified")

    def test_keyboard_interrupt_closes_all_owned_resources(self):
        self.runtime.wait_hook = lambda _: (_ for _ in ()).throw(KeyboardInterrupt())
        result = self.run_plan()
        self.assertEqual(result.reason, "cancelled")
        self.assertEqual(result.cleanup_state, "restored")

    def test_runner_controls_actual_collectors_through_all_measured_phases(self):
        from test_camera_trace_control import control

        pipeline, initial, recording_control = control()

        def start_recording(phase, budget):
            budget.check()
            recording_control.start_phase(phase)

        def finish_recording(phase, budget):
            recording_control.finish_phase(phase)
            budget.check()

        old_wait = self.runtime.wait_until

        def wait(deadline, budget):
            before = self.runtime.frames
            old_wait(deadline, budget)
            for number in range(before, self.runtime.frames):
                for pad in pipeline.pads.values():
                    self.assertTrue(
                        all(value == "OK" for value in pad.buffer(100 + number))
                    )

        old_restore = self.runtime.restore

        def restore(resource, budget):
            if resource.kind == "recording":
                return recording_control.close()
            return old_restore(resource, budget)

        self.runtime.start_recording = start_recording
        self.runtime.finish_recording = finish_recording
        self.runtime.wait_until = wait
        self.runtime.restore = restore
        result = self.run_plan(True)
        self.assertEqual(result.status, "completed")
        self.assertEqual(
            [len(r.streams[0].frames) for _, r in recording_control.finished],
            [900, 720, 720, 900],
        )
        self.assertTrue(all(r.finished for _, r in recording_control.finished))
        self.assertTrue(initial.finished)
        self.assertTrue(all(not p.callbacks for p in pipeline.pads.values()))

    def test_counter_reset_worker_exit_and_ownership_generation_abort(self):
        for failure in ("counter", "workers", "ownership"):
            with self.subTest(failure=failure):
                self.clock.value = 0
                self.runtime = Runtime(self.clock)

                def change(runtime, failure=failure):
                    if runtime.clock.value >= 45 * SECOND:
                        if failure == "counter":
                            runtime.frames = 0
                        elif failure == "workers":
                            runtime.workers = 0
                        else:
                            runtime.foreign.add(runtime.resources[-1].token)

                self.runtime.wait_hook = change
                result = self.run_plan(True)
                self.assertEqual(result.status, "aborted")
                self.assertEqual(result.phases[-1].state, "partial")
                if failure == "ownership":
                    self.assertEqual(result.cleanup_reason, "ownership_lost")
                    # Explicit recovery must resolve dirty intent before the next run.
                    with RuntimeLease(self.temp.name) as lease:
                        self.runtime.foreign.clear()
                        self.assertTrue(
                            lease.recover(
                                self.runtime,
                                Budget(
                                    Timeline(self.clock), self.clock.value + 10 * SECOND
                                ),
                            )
                        )

    def test_long_phase_capacity_and_large_absolute_monotonic_origin(self):
        from camera_trace_config import TraceConfig

        durations = (SECOND, 300 * SECOND, SECOND, SECOND, SECOND, SECOND)
        with self.assertRaises(ValueError):
            RunPlan("run-1", "healthy", 0, durations)
        value = RunPlan(
            "run-1",
            "healthy",
            0,
            durations,
            trace_config=TraceConfig(every_nth_frame=5),
        )
        RunPlan(
            "run-1",
            "healthy",
            0,
            (SECOND,) * 6,
            trace_config=TraceConfig(budget_ns=50_000_000),
        )
        self.clock.value = 2**53 + SECOND
        result = self.run_plan(value=value)
        self.assertEqual(result.status, "completed")
        self.assertEqual(result.phases[0].start_ns, 0)
        self.assertEqual(result.phases[-1].end_ns, 305 * SECOND)

    def test_runtime_setup_precedes_warmup_origin_and_retains_its_deadline(self):
        def open_runtime(plan, resources, budget):
            self.clock.value += SECOND

        self.runtime.open = open_runtime
        result = self.run_plan()
        self.assertEqual(result.status, "completed")
        self.assertEqual(result.phases[0].start_ns, 0)
        self.assertEqual(self.clock.value, 141 * SECOND)

        def slow_open(plan, resources, budget):
            self.clock.value += 3 * SECOND

        self.runtime.open = slow_open
        result = self.run_plan()
        self.assertEqual(result.reason, "timeout")
        self.assertFalse(result.phases)

    def test_stop_cannot_exceed_the_predeclared_action_allowance(self):
        old_start = self.runtime.start_action

        def start(value, budget):
            success = old_start(value, budget)
            self.clock.value += 5 * SECOND
            return success

        self.runtime.start_action = start
        old_wait = self.runtime.wait_until

        def wait(deadline, budget):
            extra = 2 * SECOND if deadline in (75 * SECOND, 107 * SECOND) else 0
            old_wait(deadline + extra, budget)

        self.runtime.wait_until = wait
        old_stop = self.runtime.stop_action

        def stop(budget):
            success = old_stop(budget)
            self.clock.value += 2 * SECOND
            return success

        self.runtime.stop_action = stop
        result = self.run_plan(True)
        self.assertEqual((result.status, result.reason), ("aborted", "timeout"))
        self.assertNotIn(("record", "recovery"), self.runtime.calls)

    def test_resource_and_plan_strict_boundaries(self):
        for kwargs in (
            {"workers": True},
            {"seed": True},
            {"scenario": "network_delay"},
            {"durations_ns": [SECOND] * 6},
            {"durations_ns": (301 * SECOND,) * 6},
            {"run_id": "run-01"},
        ):
            data = dict(
                run_id="run-1", scenario="healthy", seed=0, durations_ns=(SECOND,) * 6
            )
            data.update(kwargs)
            with self.assertRaises(ValueError):
                RunPlan(**data)
        with self.assertRaises(ValueError):
            Resource("shell", "a" * 32, "b" * 32)
        with self.assertRaises(ValueError):
            Counters(True, 0, 0)


if __name__ == "__main__":
    unittest.main()
