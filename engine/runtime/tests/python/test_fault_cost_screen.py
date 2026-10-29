"""Invented lifecycle assertions and CPU counters; no claimed native execution."""

import copy
import unittest
from test_game_failure_screen import cohort as lifecycles
from test_full_span_cohort import container_events
from test_action_span import acquisition
from live_probe_control.fault_cost_screen import METHOD, PHASES, assess


def cohort():
    rows = lifecycles()[1:]
    kinds = {
        "game_failure_dispatched": 0,
        "game_failure_fault": 1,
        "game_failure_result": 2,
        "game_failure_verified": 3,
    }
    for run in rows:
        run.update(
            mode=run["mode"] + "-cost",
            method=METHOD,
            role="contained_game_fault_cost_not_qualification",
        )
        new = [
            container_events()[0],
            dict(
                kind="fault_cost_started",
                method=METHOD,
                case=run["case"],
                live_authority=False,
            ),
        ]
        for e in run["events"]:
            if e["kind"] == "camera_ready":
                e["mode"] = run["mode"]
            index = kinds.get(e["kind"])

            def point(i):
                return dict(
                    kind="fault_cost_checkpoint",
                    method=METHOD,
                    case=run["case"],
                    phase=PHASES[i],
                    index=i,
                    live_authority=False,
                    sample=dict(
                        read_start_ns=(i + 1) * 1000000000,
                        read_end_ns=(i + 1) * 1000000000 + 1000,
                        usage_usec=(i + 1) * 100000,
                        user_usec=(i + 1) * 50000,
                        system_usec=(i + 1) * 50000,
                    ),
                )

            if index == 0:
                new.append(point(0))
            new.append(e)
            if index is not None and index > 0:
                new.append(point(index))
        new += [
            dict(
                kind="failure_lifetime",
                phase=phase,
                case=run["case"],
                live_authority=False,
            )
            for phase in ("active_target", "replacement_ready", "issuer_restarted")
        ]
        new += container_events()[1:]
        run["events"] = new
        run["browser_cost_span"] = copy.deepcopy(acquisition()["browser_cost_span"])
    return rows


class FaultCostTests(unittest.TestCase):
    def test_all_faults_preserve_lifecycle_semantics_and_bounded_CPU(self):
        result = assess(cohort())
        self.assertEqual(result["cost_screen"], "met", result)
        for row in result["cases"]:
            self.assertEqual(len(row["container_intervals"]), 4)
            self.assertAlmostEqual(row["container_intervals"][0]["usage_seconds"], 0.1)
            self.assertEqual(row["cost_limits"], "not_evaluated")
            self.assertFalse(row["live_authority"])
        self.assertEqual(result["cases"][0]["lifecycle"]["ledger_state"], "clean")
        self.assertEqual(result["cases"][1]["lifecycle"]["ledger_state"], "dirty")

    def test_dirty_bypass_and_budget_reset_cannot_become_cost_success(self):
        for field, value in [("ledger_state", "clean"), ("reserved_ns", 0)]:
            rows = cohort()
            next(e for e in rows[1]["events"] if e["kind"] == "game_failure_result")[
                field
            ] = value
            result = assess(rows)
            self.assertEqual(result["cost_screen"], "unavailable")
            self.assertEqual(result["cases"][1]["cost_screen"], "unavailable")
            self.assertEqual(result["cases"][3]["cost_screen"], "met")

    def test_missing_reset_or_misordered_checkpoints_and_lost_browser_inventory(self):
        for mutation in ("missing", "reset", "index", "inventory", "lifetime"):
            rows = cohort()
            run = rows[0]
            points = [e for e in run["events"] if e["kind"] == "fault_cost_checkpoint"]
            if mutation == "missing":
                run["events"].remove(points[2])
            elif mutation == "reset":
                points[2]["sample"]["usage_usec"] = 0
            elif mutation == "index":
                points[2]["index"] = 1
            elif mutation == "inventory":
                run["browser_cost_span"]["after"]["inventory_hash"] = "other"
            else:
                run["events"] = [
                    e for e in run["events"] if e["kind"] != "failure_lifetime"
                ]
            self.assertEqual(assess(rows)["cost_screen"], "unavailable", mutation)

    def test_original_order_and_context_required_and_failed_rows_retained(self):
        rows = cohort()
        self.assertEqual(assess(rows[:2])["cost_screen"], "unavailable")
        rows[1]["context"]["software_hash"] = "f" * 64
        result = assess(rows)
        self.assertEqual(result["cost_screen"], "unavailable")
        self.assertEqual(len(result["cases"]), 4)
        rows = cohort()
        rows[0] = dict(status="failed", mode=rows[0]["mode"])
        result = assess(rows)
        self.assertEqual(result["cost_screen"], "unavailable")
        self.assertEqual(len(result["cases"]), 4)
