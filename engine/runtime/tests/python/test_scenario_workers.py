"""Owned worker identity, recovery and bounded cleanup, plus parked Linux child smoke."""

import signal
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from scenario_adapter_support import Clock, Processes, plan
from scenario_harness import (
    Budget,
    Resource,
    RuntimeLease,
    Timeline,
)
from scenario_harness.contracts import SECOND, RunFailure
from scenario_harness.pressure import LinuxProcesses, PressureWorkers


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
