"""Artificial fixture ownership/timing branches, never accepted cause truth."""
import subprocess
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

sys.path.insert(0,str(Path(__file__).resolve().parents[4]/'scripts/research/n10'))
from condition_protocol import CONDITIONS, condition_variant
from condition_observation import ConditionObservation
from pacing_fixture import ElementPacer, peer_subprocess_proxy
from pacing_observation import PacingContrastObservation


class ConditionTests(unittest.TestCase):
    def observer(self,condition='no_injected_fault'):
        o=ConditionObservation.__new__(ConditionObservation)
        o.condition=condition;o.variant=condition_variant(condition)
        o.pressure=SimpleNamespace(used=False,closed=False,children=[],handles=[],records=[],started_at=None)
        o.reference_handle=None;o.condition_started=False;o.condition_cleanup=False
        o.origin=0;o.now=Mock(return_value=1000);o.emit=Mock()
        return o

    def test_closed_recipes_and_explicit_zero_delay_lifecycle(self):
        self.assertEqual([condition_variant(c)['delay_us'] for c in CONDITIONS],[0,34000,0])
        self.assertEqual([condition_variant(c)['pressure_workers'] for c in CONDITIONS],[0,0,2])
        for bad in (True,None,'healthy','owned_cpu_pressure;command'):
            with self.assertRaises(ValueError):condition_variant(bad)
        for condition in CONDITIONS:
            element=Mock();value=[0]
            element.get_property.side_effect=lambda _:value[0]
            element.set_property.side_effect=lambda _,v:value.__setitem__(0,v)
            owner=ElementPacer(element,lambda:True,timer=lambda *a:Mock(),condition=condition)
            owner.start();self.assertTrue(owner.started);self.assertEqual(owner.observe(),condition_variant(condition)['delay_us'])
            self.assertTrue(owner.stop());self.assertEqual(value[0],0)
        with self.assertRaises(ValueError):ElementPacer(Mock(),lambda:True,condition=CONDITIONS[0],calibration_index=0)
        with self.assertRaises(ValueError):peer_subprocess_proxy(contrast=True,condition=CONDITIONS[0])

    def test_condition_worker_command_is_exact_and_no_arbitrary_setter(self):
        with patch.object(subprocess,'Popen') as launch:
            proxy=peer_subprocess_proxy(condition='owned_identity_delay')
            proxy.Popen([sys.executable,'-u','-m','research.live_probe_control.peers.peer_worker','--dedicated-peer-worker'])
            self.assertIn("child_main'](condition='owned_identity_delay')",launch.call_args.args[0][3])
            with self.assertRaises(ValueError):proxy.Popen(['arbitrary'])

    def test_unused_registry_cannot_hide_a_child_or_return_false_cpu_measurements(self):
        o=self.observer()
        with patch('condition_observation.cgroup_counters',return_value=dict(nr_periods=1,nr_throttled=0,throttled_usec=0)):
            value=o.registry();self.assertEqual(value['state'],'unused');self.assertEqual(value['cpu_ns'],[])
            o.pressure.records=[dict(pid=1)]
            with self.assertRaises(ValueError):o.registry()

    def test_reaped_registry_requires_exited_children_and_closed_pins(self):
        o=self.observer('owned_cpu_pressure')
        o.pressure=SimpleNamespace(used=True,closed=True,children=[Mock(),Mock()],handles=[None,None],records=[{},{}],identities=lambda:['a','b'])
        for child in o.pressure.children:child.poll.return_value=0
        with patch('condition_observation.cgroup_counters',return_value=dict(nr_periods=1,nr_throttled=0,throttled_usec=0)):
            result=o.registry();self.assertEqual(result['state'],'reaped');self.assertIsNone(result['cpu_ns'])
            o.pressure.children[0].poll.return_value=None
            with self.assertRaises(ValueError):o.registry()
            o.pressure.children[0].poll.return_value=0;o.pressure.handles[0]=object()
            with self.assertRaises(ValueError):o.registry()

    def test_live_registry_uses_actual_owned_pressure_sample(self):
        o=self.observer('owned_cpu_pressure');o.pressure.used=True
        o.pressure.sample=Mock(return_value=dict(identities=['a','b'],active_workers=2,cpu_ns=[10,20],cgroup={}))
        result=o.registry();self.assertEqual(result['cpu_ns'],[10,20]);self.assertEqual(result['state'],'active')
        o.pressure.sample.side_effect=ValueError('child lost')
        with self.assertRaises(ValueError):o.registry()

    def test_reference_handle_advances_past_active_cleanup_sequence(self):
        o=self.observer();o.reference_handle=SimpleNamespace(sequence=5);o.pacer=SimpleNamespace(sequence=20)
        o.witness=Mock(return_value={'property':{'sequence':21}})
        result=o.reference_witness(object());self.assertEqual(o.reference_handle.sequence,20)
        self.assertEqual(result['condition_witness']['property']['sequence'],21)

    def test_pacer_failure_still_attempts_pressure_cleanup(self):
        o=self.observer();o.pressure.close=Mock(return_value=True);o.pressure.identities=lambda:[]
        with patch.object(PacingContrastObservation,'stop_pacing',side_effect=ValueError('pacer lost')):
            with self.assertRaises(ValueError):o.stop_pacing()
        o.pressure.close.assert_called_once();self.assertTrue(o.condition_cleanup)
        self.assertEqual(o.emit.call_args.kwargs['state'],'closed_unused')
        o.stop_condition();o.pressure.close.assert_called_once()

    def test_healthy_reference_completes_before_pressure_start_and_future_ticks_check_it(self):
        o=self.observer('owned_cpu_pressure');o.pacing_stage='healthy';o.pacer=SimpleNamespace(generation={'owner':'o'})
        o.pressure.start=Mock(return_value={'workers':2});o.pressure.alive=Mock()
        def reference_done():o.pacing_stage='establish';return False
        with patch.object(PacingContrastObservation,'tick',side_effect=reference_done):
            self.assertFalse(o.tick())
        o.pressure.start.assert_called_once();o.pressure.alive.assert_not_called();self.assertTrue(o.condition_started)
        with patch.object(PacingContrastObservation,'tick',return_value=False) as base:
            o.tick();base.assert_not_called()
            o.now.return_value=1000001000;o.tick();base.assert_called_once()
        self.assertEqual(o.pressure.alive.call_count,2)
