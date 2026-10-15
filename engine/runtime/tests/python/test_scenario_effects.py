"""Independent integer effect predicates and priority; no live pressure run."""

import sys
import unittest
from dataclasses import replace
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from scenario_adapter_support import execution, plan
from scenario_harness import (
    evaluate_effect,
)
from scenario_harness.contracts import SECOND


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


if __name__ == "__main__":
    unittest.main()
