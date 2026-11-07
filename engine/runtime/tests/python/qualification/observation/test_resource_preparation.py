"""Bounded preparation before reference measurement; no timestamp/guard relaxation."""

import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

RUNTIME = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(RUNTIME))
sys.path.insert(0, str(RUNTIME / "scripts/research/n10"))
from condition_observation import ConditionObservation
from research.live_probe_control.control.contracts import Generation
from research.resource_observation.contained_condition import (
    MAX_PREPARATION_NS,
    ResourceConditionObservation,
)


class PreparationTests(unittest.TestCase):
    def observer(self, setup_delay=0, ready_delay=0):
        clock = [1000]
        events = []
        reads = []
        slot = SimpleNamespace(
            owner=SimpleNamespace(generation=Generation("owner", "pipe", "peer"))
        )

        def emit(kind, **fields):
            if kind == "n11_resource_context":
                clock[0] += setup_delay
            events.append(dict(kind=kind, **fields))

        def initialize(o, **kwargs):
            o.origin = 0
            o.now = lambda: clock[0]
            o.emit = emit
            o.pacing_stage = "healthy"
            o.phase = "degraded"
            o.stage = "measure"
            o.condition_started = o.condition_cleanup = False
            o.identities = None
            o.reference_rows = []
            o.reference_sequence = None
            o.scene = SimpleNamespace(game=SimpleNamespace(poll=lambda: None))
            o.slots = Mock(return_value={"first": slot})
            o.target_ready = Mock(return_value=True)

            def ready(*args, **kwargs):
                clock[0] += ready_delay
                return True

            o.ready = Mock(side_effect=ready)
            o.identity = Mock(return_value={"first": "source"})

        def factory(**options):
            def sample():
                row = dict(
                    sequence=len(reads),
                    clock_id=options["clock_id"],
                    read_start_ns=clock[0],
                    read_end_ns=clock[0],
                    quota=dict(quota_usec=200000, period_usec=100000),
                )
                reads.append(row)
                return row

            return SimpleNamespace(sample=sample)

        with patch.object(ConditionObservation, "__init__", initialize):
            o = ResourceConditionObservation(condition="no_injected_fault", sampler_factory=factory)
        return o, clock, events, reads, slot

    def test_slow_context_initialization_takes_no_measurement_and_next_tick_is_honest(self):
        o, clock, events, reads, slot = self.observer(setup_delay=60_050_000)
        with patch.object(ConditionObservation, "reference") as base:
            self.assertFalse(o.reference(clock[0]))
            base.assert_not_called()
        self.assertEqual(reads, [])
        self.assertEqual(o.reference_rows, [])
        self.assertIsNone(o.reference_sequence)
        self.assertEqual(
            [e["kind"] for e in events], ["n11_resource_context", "n11_observer_prepared"]
        )
        self.assertEqual(events[-1]["measurement_samples_taken"], 0)
        tick = clock[0]
        captured = []

        def reference(now):
            captured.append(now)
            o.native_read_evidence(slot, dict(read_start_ns=1, read_end_ns=2))
            return False

        with patch.object(ConditionObservation, "reference", side_effect=reference):
            self.assertFalse(o.reference(tick))
        self.assertEqual(captured, [tick])
        self.assertEqual(reads[0]["read_start_ns"], tick)
        self.assertEqual(reads[0]["sequence"], 0)

    def test_slow_initial_readiness_is_before_the_first_reference_sample(self):
        o, clock, _, reads, _ = self.observer(ready_delay=60_050_000)
        self.assertFalse(o.reference(1000))
        self.assertEqual(clock[0], 60_051_000)
        self.assertEqual(reads, [])
        o.ready.assert_called_once()

    def test_later_measurement_stall_is_not_hidden_or_retimestamped(self):
        o, clock, _, reads, slot = self.observer()
        o.reference(clock[0])
        tick = clock[0]

        def reference(now):
            self.assertEqual(now, tick)
            clock[0] += 60_050_000
            o.native_read_evidence(slot, dict(read_start_ns=1, read_end_ns=2))
            return False

        with patch.object(ConditionObservation, "reference", side_effect=reference):
            o.reference(tick)
        self.assertEqual(reads[0]["read_start_ns"] - tick, 60_050_000)

    def test_not_ready_does_not_construct_emit_sample_or_advance(self):
        o, _, events, reads, _ = self.observer()
        o.ready = Mock(return_value=False)
        self.assertFalse(o.reference(1000))
        self.assertEqual(events, [])
        self.assertEqual(reads, [])
        self.assertIsNone(o._resource_sampler)
        self.assertIsNone(o.identities)

    def test_preparation_is_once_only_with_no_warmup_counter_read(self):
        o, clock, events, reads, _ = self.observer()
        o.reference(clock[0])
        with patch.object(ConditionObservation, "reference", return_value=False) as base:
            o.reference(clock[0])
            o.reference(clock[0])
            self.assertEqual(base.call_count, 2)
        self.assertEqual(len([e for e in events if e["kind"] == "n11_observer_prepared"]), 1)
        self.assertEqual(reads, [])

    def test_setup_budget_failure_latches_and_keeps_cleanup_path_available(self):
        o, _, events, reads, _ = self.observer(setup_delay=MAX_PREPARATION_NS + 1)
        with self.assertRaises(ValueError):
            o.reference(1000)
        self.assertTrue(o._resource_failed)
        self.assertEqual(reads, [])
        o.emit("n11_condition_cleanup", state="closed_unused")
        self.assertEqual(events[-1]["kind"], "n11_condition_cleanup")
        with self.assertRaises(ValueError):
            o.reference(1000)

    def test_setup_identity_or_scene_loss_fails_instead_of_rebinding(self):
        for kind in ("identity", "scene"):
            o, _, _, reads, _ = self.observer()
            if kind == "identity":
                o.identities = {"first": "other"}
            else:
                o.scene.game.poll = lambda: 1
            with self.assertRaises(ValueError):
                o.reference(1000)
            self.assertTrue(o._resource_failed)
            self.assertEqual(reads, [])

    def test_generation_change_after_preparation_invalidates_before_read(self):
        o, _, _, reads, slot = self.observer()
        o.reference(1000)
        slot.owner.generation = Generation("new", "pipe", "peer")
        with self.assertRaises(ValueError):
            o.native_read_evidence(slot, dict(read_start_ns=1, read_end_ns=2))
        self.assertEqual(reads, [])
        self.assertTrue(o._resource_failed)

    def test_unready_preparation_attempt_cannot_exceed_budget_silently(self):
        o, clock, _, reads, _ = self.observer()

        def unavailable(*args, **kwargs):
            clock[0] += MAX_PREPARATION_NS + 1
            return False

        o.ready = unavailable
        with self.assertRaises(ValueError):
            o.reference(1000)
        self.assertTrue(o._resource_failed)
        self.assertEqual(reads, [])


if __name__ == "__main__":
    unittest.main()
