"""Artificial resource sampling seams; no native run or accepted condition truth."""

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
from research.resource_observation.contained_condition import ResourceConditionObservation


class ResourceConditionTests(unittest.TestCase):
    def observer(self, condition="no_injected_fault"):
        emit = Mock()

        def base_init(observer, **kwargs):
            observer.origin = 1000
            observer.now = Mock(return_value=2000)
            observer.emit = emit
            observer.condition = kwargs["condition"]
            observer.condition_started = observer.condition_cleanup = False
            observer.pacing_stage = "healthy"
            observer.phase = "degraded"
            observer.stage = "measure"
            observer.stage_start = 1000
            observer.dispatched_at = 1000

        factory = Mock()
        sampler = Mock()

        def create(**options):
            def sample():
                now = options["clock"]()
                return dict(
                    clock_id=options["clock_id"],
                    read_start_ns=now,
                    read_end_ns=now,
                    quota=dict(quota_usec=200000, period_usec=100000),
                    counters=dict(usage_usec=10),
                )

            sampler.sample.side_effect = sample
            return sampler

        factory.side_effect = create
        with patch.object(ConditionObservation, "__init__", base_init):
            observer = ResourceConditionObservation(condition=condition, sampler_factory=factory)
        slot = SimpleNamespace(
            owner=SimpleNamespace(generation=Generation("owner", "pipe", "peer"))
        )
        return observer, slot, factory, sampler, emit

    def sample(self, observer, slot):
        return observer.native_read_evidence(slot, dict(read_start_ns=1, read_end_ns=2))

    def test_constructor_no_resource_io_and_reads_use_controller_relative_clock(self):
        observer, slot, factory, sampler, emit = self.observer()
        factory.assert_not_called()
        emit.assert_not_called()
        result = self.sample(observer, slot)
        self.assertEqual(result["container_cpu_read"]["read_start_ns"], 1000)
        self.assertEqual(result["container_cpu_read"]["phase"], "healthy")
        self.assertNotEqual(
            result["native_read"]["clock_id"], result["container_cpu_read"]["clock_id"]
        )
        self.assertEqual(result["native_read"]["read_start_ns"], 1)
        factory.assert_called_once()
        sampler.sample.assert_called_once()
        self.assertEqual(
            result["container_cpu_read"]["clock_id"],
            "controller-monotonic-9812989e220f8e39099f072549bdaab02f4c9f5e90c310231ca315de7f3acde5",
        )
        self.assertEqual(emit.call_args.args[0], "n11_resource_context")
        self.assertEqual(emit.call_args.kwargs["context"]["controller_origin_ns"], "1000")

    def test_all_conditions_get_identical_measured_fields_and_fixed_quota(self):
        rows = []
        for condition in ("no_injected_fault", "owned_identity_delay", "owned_cpu_pressure"):
            observer, slot, factory, _, _ = self.observer(condition)
            rows.append(self.sample(observer, slot))
            self.assertEqual(factory.call_args.kwargs["expected_quota_us"], 200000)
            self.assertEqual(factory.call_args.kwargs["expected_period_us"], 100000)
        self.assertEqual(rows[0], rows[1])
        self.assertEqual(rows[1], rows[2])
        self.assertNotIn("condition", rows[0]["container_cpu_read"])

    def test_one_sampler_reused_for_all_five_phase_seams(self):
        observer, slot, factory, _, _ = self.observer()
        phases = []
        for phase in ("healthy", "degraded", "relief", "recovery", "post"):
            observer.pacing_stage = phase if phase in ("healthy", "post") else "pair"
            observer.phase = phase
            phases.append(self.sample(observer, slot)["container_cpu_read"]["phase"])
        self.assertEqual(phases, ["healthy", "degraded", "relief", "recovery", "post"])
        factory.assert_called_once()

    def test_generation_and_origin_changes_fail_without_new_sampler(self):
        for change in ("generation", "origin"):
            with self.subTest(change=change):
                observer, slot, factory, _, _ = self.observer()
                self.sample(observer, slot)
                if change == "generation":
                    slot.owner.generation = Generation("new", "pipe", "peer")
                else:
                    observer.origin = 1001
                with self.assertRaises(ValueError):
                    self.sample(observer, slot)
                self.assertTrue(observer._resource_failed)
                factory.assert_called_once()

    def test_sampler_failure_latches_but_cleanup_events_still_forward(self):
        observer, slot, _, sampler, emit = self.observer()
        self.sample(observer, slot)
        sampler.sample.side_effect = ValueError("failed")
        with self.assertRaises(ValueError):
            self.sample(observer, slot)
        sampler.sample.reset_mock()
        with self.assertRaises(ValueError):
            self.sample(observer, slot)
        sampler.sample.assert_not_called()
        observer.pressure = SimpleNamespace(
            used=True, close=Mock(return_value=True), identities=lambda: []
        )
        observer.stop_condition()
        observer.stop_condition()
        observer.pressure.close.assert_called_once()
        self.assertEqual(emit.call_args.args[0], "n11_condition_cleanup")
        self.assertEqual(emit.call_args.kwargs["state"], "reaped")
        self.assertTrue(observer.condition_cleanup)
        with self.assertRaises(ValueError):
            observer.emit("n11_pair_phase_completed", phase="degraded", at_ns=0)

    def test_outside_fixed_sampling_stage_rejected(self):
        observer, slot, _, _, _ = self.observer()
        observer.pacing_stage = "establish"
        with self.assertRaises(ValueError):
            self.sample(observer, slot)

    def test_expired_twenty_second_fault_window_cannot_be_extended_by_read(self):
        observer, slot, _, _, _ = self.observer()
        observer.condition_started = True
        observer.condition_started_at = 0
        observer.now.return_value = 20_000_000_000
        with self.assertRaises(ValueError):
            self.sample(observer, slot)

    def test_phase_end_is_after_resource_read_on_actual_controller_clock(self):
        observer, slot, _, _, emit = self.observer()
        observer.pacing_stage = "pair"
        observer.phase = "degraded"
        self.sample(observer, slot)
        observer.now.return_value = 3000
        observer.emit("n11_pair_phase_completed", phase="degraded", at_ns=1, action_elapsed_ns=None)
        self.assertEqual(emit.call_args.kwargs["at_ns"], 2000)
        self.assertGreaterEqual(emit.call_args.kwargs["at_ns"], 1000)
        observer.phase = "relief"
        self.sample(observer, slot)
        observer.emit("n11_pair_phase_completed", phase="relief", at_ns=1, action_elapsed_ns=1)
        self.assertEqual(emit.call_args.kwargs["action_elapsed_ns"], 2000)

    def test_late_phase_and_five_second_action_completion_rejected(self):
        for kind in ("phase", "action"):
            with self.subTest(kind=kind):
                observer, slot, _, _, emit = self.observer()
                observer.pacing_stage = "pair"
                observer.phase = "relief"
                self.sample(observer, slot)
                emit.reset_mock()
                observer.now.return_value = 5_000_001_000
                observer.stage_start = 0 if kind == "phase" else 4_000_001_000
                observer.dispatched_at = 1000
                with self.assertRaises(ValueError):
                    observer.emit("n11_pair_phase_completed", phase="relief", at_ns=1)
                emit.assert_not_called()
                self.assertTrue(observer._resource_failed)

    def test_ordinary_condition_class_is_not_modified(self):
        self.assertEqual(ConditionObservation.method, "n11-contained-condition-witness-v1")
        observer, _, _, _, _ = self.observer()
        self.assertEqual(observer.method, "n11-contained-condition-resource-candidate-v1")

    def test_completion_cannot_precede_resource_read_or_use_other_phase(self):
        for kind in ("clock", "phase"):
            with self.subTest(kind=kind):
                observer, slot, _, _, emit = self.observer()
                observer.pacing_stage = "pair"
                observer.phase = "degraded"
                self.sample(observer, slot)
                emit.reset_mock()
                if kind == "clock":
                    observer.now.return_value = 1500
                with self.assertRaises(ValueError):
                    observer.emit(
                        "n11_pair_phase_completed",
                        phase="relief" if kind == "phase" else "degraded",
                        at_ns=0,
                    )
                emit.assert_not_called()

    def reference_rows(self, inner=2_000_000_000, worker_inner=None):
        worker_inner = inner if worker_inner is None else worker_inner
        rows = []
        for i in range(5):
            row = {}
            for key, span, clock in (
                ("container_cpu_read", inner, "controller"),
                ("native_read", worker_inner, "worker"),
            ):
                start = (span + 1000) * i // 4
                row[key] = dict(read_start_ns=start, read_end_ns=start + 1000, clock_id=clock)
            rows.append(row)
        return rows

    def test_reference_requires_actual_cpu_and_worker_inner_duration(self):
        observer, _, _, _, _ = self.observer()
        self.assertFalse(observer._reference_read_spans_ready(self.reference_rows(1_999_415_376)))
        self.assertFalse(
            observer._reference_read_spans_ready(self.reference_rows(2_000_000_000, 1_999_999_999))
        )
        self.assertTrue(observer._reference_read_spans_ready(self.reference_rows(2_000_000_000)))
        self.assertTrue(observer._reference_read_spans_ready(self.reference_rows(2_500_000_000)))
        self.assertFalse(observer._reference_read_spans_ready(self.reference_rows()[:3]))

    def test_reference_pending_retains_rows_and_does_not_emit_or_advance(self):
        observer, _, _, _, emit = self.observer()
        observer.reference_rows = self.reference_rows(1_999_415_376)

        def base_reference(now):
            observer.emit("n11_pacing_reference", phase="post", samples=observer.reference_rows)
            observer.reference_rows = []
            return True

        with patch.object(ConditionObservation, "reference", side_effect=base_reference):
            self.assertFalse(observer.reference(100))
            self.assertEqual(len(observer.reference_rows), 5)
            self.assertFalse(observer._resource_failed)
            emit.assert_not_called()
            observer.reference_rows = self.reference_rows(2_500_000_000)
            self.assertTrue(observer.reference(200))
            self.assertEqual(observer.reference_rows, [])
            self.assertEqual(emit.call_count, 1)

    def test_bad_reference_clock_and_overlong_window_fail_sticky(self):
        for kind in ("clock", "long"):
            observer, _, _, _, emit = self.observer()
            rows = self.reference_rows(5_000_000_001 if kind == "long" else 2_000_000_000)
            if kind == "clock":
                rows[-1]["native_read"]["clock_id"] = "changed"
            with self.assertRaises(ValueError):
                observer.emit("n11_pacing_reference", phase="post", samples=rows)
            self.assertTrue(observer._resource_failed)
            emit.assert_not_called()

    def test_reference_fix_does_not_change_normal_condition_reference_method(self):
        self.assertIsNot(ResourceConditionObservation.reference, ConditionObservation.reference)


if __name__ == "__main__":
    unittest.main()
