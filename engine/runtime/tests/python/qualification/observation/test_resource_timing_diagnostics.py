"""Deterministic diagnostic paths; never execution or OS scheduling evidence."""

import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

RUNTIME = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(RUNTIME))
sys.path.insert(0, str(RUNTIME / "scripts/research/n10"))
from condition_observation import ConditionObservation
from research.live_probe_control.control.contracts import Generation
from research.resource_observation.contained_condition import (
    ResourceConditionObservation,
)
from research.resource_observation.modes import condition_observer_class
from research.resource_observation.timing_diagnostics import (
    MAX_MARKS,
    ResourceTimingObservation,
)


class TimingDiagnosticTests(unittest.TestCase):
    def observer(self, delay=0, emit_delay=0):
        clock = [1000]
        events = []

        def emit(kind, **fields):
            if kind == "n11_resource_context":
                clock[0] += emit_delay
            events.append(dict(kind=kind, **fields))

        def initialize(observer, **kwargs):
            observer.origin = 0
            observer.now = lambda: clock[0]
            observer.emit = emit
            observer.pacing_stage = "healthy"
            observer.phase = "degraded"
            observer.stage = "measure"
            observer.condition_started = observer.condition_cleanup = False

        def factory(**options):
            return SimpleNamespace(
                sample=lambda: dict(
                    clock_id=options["clock_id"],
                    sequence=0,
                    read_start_ns=clock[0],
                    read_end_ns=clock[0] + 100,
                    quota=dict(quota_usec=200000, period_usec=100000),
                )
            )

        with patch.object(ConditionObservation, "__init__", initialize):
            observer = ResourceTimingObservation(
                condition="no_injected_fault", sampler_factory=factory
            )
        slot = SimpleNamespace(
            owner=SimpleNamespace(generation=Generation("owner", "pipe", "peer"))
        )

        def ready(*args, **kwargs):
            clock[0] += delay
            return True

        def reference(now):
            observer.ready({})
            observer.native_read_evidence(slot, dict(read_start_ns=10, read_end_ns=20))
            return False

        return observer, clock, events, ready, reference, slot

    def test_elapsed_ready_delay_is_visible_and_original_lag_is_not_hidden(self):
        observer, clock, events, ready, reference, _ = self.observer(delay=60_050_000)
        with (
            patch.object(ConditionObservation, "reference", side_effect=reference),
            patch.object(ConditionObservation, "ready", side_effect=ready),
        ):
            self.assertFalse(observer.reference(1000))
        event = next(e for e in events if e["kind"] == "n11_observer_timing")
        self.assertEqual(event["resource_read_start_ns"] - event["observer_tick_ns"], 60_050_000)
        span = next(s for s in event["spans"] if s["component"] == "ready")
        self.assertEqual(span["end_ns"] - span["start_ns"], 60_050_000)
        self.assertFalse(event["live_authority"])
        self.assertEqual(event["observer_tick_ns"], 1000)
        self.assertNotIn("condition", event)

    def test_context_output_delay_is_attributed_to_its_nested_span(self):
        observer, _, events, ready, reference, _ = self.observer(emit_delay=60_050_000)
        with (
            patch.object(ConditionObservation, "reference", side_effect=reference),
            patch.object(ConditionObservation, "ready", side_effect=ready),
        ):
            observer.reference(1000)
        trace = next(e for e in events if e["kind"] == "n11_observer_timing")
        span = next(s for s in trace["spans"] if s["component"] == "context_emit")
        self.assertEqual(span["end_ns"] - span["start_ns"], 60_050_000)
        self.assertEqual(trace["resource_read_start_ns"] - trace["observer_tick_ns"], 60_050_000)
        self.assertLess(
            next(i for i, e in enumerate(events) if e["kind"] == "n11_resource_context"),
            next(i for i, e in enumerate(events) if e["kind"] == "n11_observer_timing"),
        )

    def test_at_most_two_traces_in_each_reference_phase_and_no_phase_trace(self):
        observer, clock, events, ready, reference, slot = self.observer()
        with (
            patch.object(ConditionObservation, "reference", side_effect=reference),
            patch.object(ConditionObservation, "ready", side_effect=ready),
        ):
            for phase in ("healthy", "post"):
                observer.pacing_stage = phase
                for _ in range(5):
                    observer.reference(clock[0])
        self.assertEqual(len([e for e in events if e["kind"] == "n11_observer_timing"]), 4)
        observer.pacing_stage = "pair"
        observer.native_read_evidence(slot, dict(read_start_ns=10, read_end_ns=20))
        self.assertEqual(len([e for e in events if e["kind"] == "n11_observer_timing"]), 4)

    def test_eligibility_polls_without_measurement_emit_no_traces(self):
        observer, _, events, _, _, _ = self.observer()
        with patch.object(ConditionObservation, "reference", return_value=False):
            for _ in range(20):
                self.assertFalse(observer.reference(1000))
        self.assertEqual(events, [])
        self.assertIsNone(observer._timing_trace)
        self.assertEqual(observer._timing_events, 0)

    def test_failure_keeps_cleanup_events_available_and_no_false_measurement_trace(
        self,
    ):
        observer, _, events, _, _, _ = self.observer()
        with (
            patch.object(ConditionObservation, "reference", side_effect=ValueError("source lost")),
            self.assertRaises(ValueError),
        ):
            observer.reference(1000)
        self.assertIsNone(observer._timing_trace)
        observer.emit("n11_condition_cleanup", state="reaped")
        self.assertEqual([e["kind"] for e in events], ["n11_condition_cleanup"])

    def test_diagnostic_span_budget_is_bounded(self):
        observer, _, _, _, _, _ = self.observer()
        observer._timing_trace = dict(spans=[{}] * MAX_MARKS)
        with self.assertRaises(ValueError):
            observer._timed("overflow", lambda: None)

    def test_explicit_route_does_not_change_default_observer(self):
        self.assertIs(condition_observer_class(True), ResourceConditionObservation)
        self.assertIs(condition_observer_class(True, timing=True), ResourceTimingObservation)
        with self.assertRaises(ValueError):
            condition_observer_class(False, timing=True)
        with self.assertRaises(ValueError):
            condition_observer_class(True, timing="yes")


if __name__ == "__main__":
    unittest.main()
