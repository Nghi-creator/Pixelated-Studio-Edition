"""Pressure ownership/cleanup tests use fake processes and never load the host."""
import json
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[4] / "scripts/research/n10"))
from contained_pressure import ContainedPressure
from contention_observation import ContentionObservation


class Processes:
    def __init__(self):
        self.children, self.cpu, self.stopped = {}, {}, set()
        self.activations, self.fail_pin = [], False
        self.owner = None

    def spawn(self, duration):
        assert duration == 40000000000
        pid = 100+len(self.children)
        child = Mock(pid=pid)
        child.stdin.closed = False
        def close():
            child.stdin.closed = True; self.stopped.add(pid)
        child.stdin.close.side_effect = close
        child.wait.side_effect = lambda timeout: 0 if pid in self.stopped else None
        child.poll.side_effect = lambda: 0 if pid in self.stopped else None
        child.kill.side_effect = lambda: self.stopped.add(pid)
        self.children[pid], self.cpu[pid] = child, 1000000
        return child

    def pin(self, pid):
        if self.fail_pin and pid == 101: raise OSError("pin failed")
        return pid

    def handshake(self, child, message, budget): budget.check()
    def identity(self, pid): return "boot", pid*10, self.cpu[pid]
    def exited(self, fd): return fd in self.stopped
    def send(self, fd, sig): self.stopped.add(fd)
    def close(self, fd): pass

    def activate(self, child):
        # Activation must follow durable ownership of BOTH children.
        data = json.loads((Path(self.owner.directory.name) / "intent.json").read_text())
        assert data["state"] == "parked" and len(data["workers"]) == 2
        self.activations.append(child.pid)


class PressureTests(unittest.TestCase):
    def make(self):
        processes = Processes()
        with patch("contained_pressure.LinuxProcesses", return_value=processes):
            owner = ContainedPressure()
        processes.owner = owner
        self.addCleanup(owner.close)
        return owner, processes

    @patch("contained_pressure.cgroup_counters", return_value=dict(nr_periods=1,nr_throttled=1,throttled_usec=10))
    def test_durable_two_child_ownership_precedes_go_and_same_children_are_reaped(self, _):
        owner, processes = self.make()
        started = owner.start()
        self.assertEqual(started["workers"], 2)
        self.assertEqual(processes.activations, [100, 101])
        self.assertEqual(owner.sample()["identities"], started["identities"])
        with self.assertRaisesRegex(ValueError, "single use"): owner.start()
        self.assertTrue(owner.close()); self.assertTrue(owner.close())
        self.assertEqual(processes.stopped, {100, 101})

    @patch("contained_pressure.cgroup_counters", return_value={})
    def test_pre_activation_pin_failure_reaps_exact_owned_children_without_go(self, _):
        owner, processes = self.make(); processes.fail_pin = True
        with self.assertRaises(OSError): owner.start()
        self.assertEqual(processes.activations, [])
        self.assertTrue(owner.close()); self.assertEqual(processes.stopped, {100, 101})

    @patch("contained_pressure.cgroup_counters", return_value={})
    def test_generation_change_early_exit_counter_reset_and_deadline_are_rejected(self, _):
        for failure in ("identity", "exit", "reset", "deadline"):
            owner, processes = self.make(); owner.start(); owner.sample()
            if failure == "identity": processes.identity = lambda pid: ("foreign", 1, 1)
            if failure == "exit": processes.stopped.add(100)
            if failure == "reset": processes.cpu[100] = 0
            if failure == "deadline": owner.started_at -= 20000000000
            with self.assertRaises(ValueError): owner.sample()
            self.assertTrue(owner.close())


    @patch("contained_pressure.cgroup_counters", return_value={})
    def test_failed_stop_persistence_remains_unconfirmed_and_can_finish_owned_cleanup(self, _):
        owner, processes = self.make(); owner.start()
        with patch.object(owner, "persist", side_effect=OSError("write failed")):
            self.assertFalse(owner.close())
        self.assertFalse(owner.closed)
        self.assertEqual(processes.stopped, {100, 101})
        self.assertTrue(owner.close())



class LifecycleTests(unittest.TestCase):
    def make(self):
        p = object.__new__(ContentionObservation)
        p.pressure_stage, p.reference_rows = "healthy", []
        p.reference_sequence = p.pressure_sequence = None
        p.cleanup_emitted, p.identities = False, None
        p.origin, p.phase, p.stage = 0, "degraded", "eligibility"
        self.clock = 100000000
        p.now = lambda: self.clock
        self.body = dict(configured_fps=30,negotiated_fps=30,capture_buffers=0,encoded_buffers=0)
        self.slot = SimpleNamespace(owner=SimpleNamespace(last_observation=(self.body, self.clock, 1)))
        p.service = SimpleNamespace(active={"first": self.slot})
        p.scene = SimpleNamespace(game=SimpleNamespace(poll=lambda:None))
        p.slots = lambda peers: {"first": self.slot}
        p.target_ready = lambda slots, target: target == 30
        p.ready = lambda slots, **kwargs: True
        p.identity = lambda slots: {"first":"owned"}
        p.emit, p.pressure = Mock(), Mock()
        p.pressure.close.return_value = True
        def start():
            p.pressure.started_at = self.clock
            return dict(workers=2,identities=["a","b"])
        p.pressure.start.side_effect = start
        p.pressure.sample.return_value = dict(cpu_ns=[1,1])
        return p

    @patch("contention_observation.cgroup_counters", return_value={})
    def test_reference_then_same_pressure_survives_pair_until_recovery(self, _):
        p = self.make()
        for i in range(5):
            self.clock = 100000000+i*500000000
            self.body["encoded_buffers"] = i*15
            self.slot.owner.last_observation = (self.body, self.clock, i+1)
            self.assertFalse(p.tick())
        self.assertEqual(p.pressure_stage, "establish")
        p.pressure.start.assert_called_once()
        self.clock += 1000000000
        with patch("contention_observation.PairedObservation.tick", return_value=False):
            self.assertFalse(p.tick())
        p.pressure.close.assert_not_called()
        with patch("contention_observation.PairedObservation.tick", return_value=True):
            self.assertFalse(p.tick())
        p.pressure.close.assert_called_once()
        self.assertEqual(p.pressure_stage, "post")

    def test_cleanup_failure_still_checkpoints_controller_without_claiming_reaped(self):
        p = self.make(); p.pressure.close.return_value = False
        with patch("contention_observation.PairedObservation.checkpoint") as controller:
            with self.assertRaisesRegex(ValueError, "cleanup"): p.checkpoint()
        controller.assert_called_once()
        self.assertEqual(p.emit.call_args.kwargs["state"], "unknown")


@unittest.skipUnless(sys.platform == "linux" and __import__('os').environ.get('N10_NATIVE_PEER_TESTS') == '1',
                     "opt-in contained two-core Linux pressure ownership")
class NativePressureTests(unittest.TestCase):
    def test_real_children_are_pinned_sampled_and_reaped(self):
        import time
        pressure = ContainedPressure()
        try:
            declaration = pressure.start()
            first = pressure.sample()
            time.sleep(0.15)
            second = pressure.sample()
            self.assertEqual(declaration['workers'], 2)
            self.assertEqual(first['identities'], second['identities'])
            self.assertTrue(all(a > b for a,b in zip(second['cpu_ns'],first['cpu_ns'],strict=True)))
        finally:
            self.assertTrue(pressure.close())
        self.assertTrue(pressure.closed)
