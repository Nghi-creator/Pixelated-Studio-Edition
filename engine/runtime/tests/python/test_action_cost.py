"""Unchanged acquisition cannot create a request; both conditions keep a fixed schedule."""

import os
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts" / "n10"))
from action_cost import GameActionCost
from live_probe_control.contracts import Generation, Request, Result


class Sampler:
    def __init__(self, service, scene, *, control_phase, during_fps, record_phase):
        self.scene, self.start = scene, None
        service.measurements.append((control_phase, during_fps))

    def sample(self):
        now = self.scene.phase()["script_age_ns"]
        if self.start is None:
            self.start = now
        return now - self.start >= 2500000000

    def report(self):
        return {"samples": []}


class ActionCostDriverTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.age = 3000000000
        self.condition = "unchanged"
        self.target_at = 6200000000
        self.events = []
        self.enterContext(
            patch("time.monotonic_ns", side_effect=lambda: 100000000000 + self.age)
        )
        self.enterContext(patch("action_cost.NativeScreen", Sampler))
        self.driver = GameActionCost.__new__(GameActionCost)
        d = self.driver
        d.condition, d.stage, d.origin = "unchanged", "scheduled", 100000000000
        d.edges, d.completed_phases = [], []
        d.boundary = d.target_since = d.restored_since = None
        d.result_seen = False
        d.restoration_sequences = None
        d.last_age = -1
        d.sampler = d.operation = None
        d.service = SimpleNamespace(measurements=[])
        d.local = MagicMock()
        d.local.directory = self.directory.name
        d.capability = object()
        d.scopes = {"first": object(), "second": object()}
        d.scene = SimpleNamespace(
            phase=lambda: dict(
                script_age_ns=self.age,
                game_age_ns=self.age + 3000000000,
                script_actions=self.age // 400000000 + 1,
            )
        )
        d.gate = SimpleNamespace(phases=[])
        d.emit = lambda kind, **body: self.events.append({"kind": kind, **body})
        d.identities = {"first": "a" * 64, "second": "b" * 64}
        d.identity = lambda slots: {"first": "a" * 64, "second": "b" * 64}
        d.ready = MagicMock(return_value=True)
        self.slots = {
            p: SimpleNamespace(owner=SimpleNamespace(last_observation=None))
            for p in ("first", "second")
        }
        d.slots = lambda: self.slots
        self.operation = SimpleNamespace(
            done=SimpleNamespace(is_set=lambda: self.age >= 11200000000),
            result=Result(
                "cost-request", "completed", "verified_by_port", "duration_elapsed"
            ),
        )
        d.local.prepare.return_value = SimpleNamespace(
            request=Request(
                "cost-request", Generation("owner", "pipe", "peer"), 24, 5000000000
            )
        )
        d.local.dispatch.return_value = self.operation
        d.completed_journal = MagicMock(
            return_value={"state": "clean", "actions": 1, "reserved_ns": 7000000000}
        )

    def tick(self, age):
        self.age = age
        for peer, slot in self.slots.items():
            fps = (
                24
                if self.driver.condition == "action"
                and peer == "first"
                and self.target_at <= age < 11200000000
                else 30
            )
            slot.owner.last_observation = (
                dict(configured_fps=fps, negotiated_fps=fps),
                100000000000 + age,
                age // 50000000 + 1,
            )
        return self.driver.tick()

    def finish(self, condition):
        self.driver.condition = condition
        for age in range(3000000000, 16600000000, 50000000):
            if self.tick(age):
                return
        self.fail("fixed schedule did not complete")

    def test_unchanged_never_prepares_dispatches_reserves_or_fabricates_result(self):
        self.driver.local.prepare.side_effect = AssertionError("unchanged prepare")
        self.driver.local.dispatch.side_effect = AssertionError("unchanged dispatch")
        self.finish("unchanged")
        self.driver.local.prepare.assert_not_called()
        self.driver.local.dispatch.assert_not_called()
        self.driver.completed_journal.assert_not_called()
        self.assertIsNone(self.driver.operation)
        self.assertFalse(
            os.path.lexists(os.path.join(self.directory.name, "journal.json"))
        )
        self.assertFalse(
            any(
                e["kind"] in ("action_cost_result", "action_cost_restore_observed")
                for e in self.events
            )
        )
        summary = self.events[-1]
        self.assertEqual(
            (summary["actions"], summary["reserved_ns"], summary["journal_state"]),
            (0, 0, "absent"),
        )
        self.assertIsNone(
            next(e for e in self.events if e["kind"] == "action_cost_boundary")[
                "request"
            ]
        )
        self.assertEqual(
            self.driver.service.measurements,
            [("baseline", 30), ("during", 30), ("restored", 30)],
        )

    def test_action_uses_same_phase_times_one_idempotent_operation_and_full_reservation(
        self,
    ):
        self.finish("action")
        self.driver.local.prepare.assert_called_once()
        self.assertEqual(self.driver.local.dispatch.call_count, 2)
        self.assertEqual(self.driver.completed_journal.call_count, 2)
        starts = [
            e["script_age_ns"]
            for e in self.driver.edges
            if e["label"].endswith("_start")
        ]
        self.assertEqual(starts, [3000000000, 7000000000, 14000000000])
        self.assertEqual(
            self.driver.service.measurements,
            [("baseline", 24), ("during", 24), ("restored", 24)],
        )
        self.assertEqual(self.events[-1]["reserved_ns"], 7000000000)
        self.assertEqual(sum(e["kind"] == "action_cost_result" for e in self.events), 1)

    def test_missed_boundary_cannot_move_the_schedule(self):
        self.tick(3000000000)
        self.tick(5500000000)
        with self.assertRaisesRegex(ValueError, "boundary missed"):
            self.tick(6200000000)

    def test_target_not_settled_by_fixed_window_fails_instead_of_waiting(self):
        self.driver.condition = "action"
        self.target_at = 6800000000
        with self.assertRaisesRegex(ValueError, "not stable"):
            for age in range(3000000000, 7050000000, 50000000):
                self.tick(age)

    def test_unchanged_rejects_unexpected_or_dangling_journal(self):
        for symlink in (False, True):
            path = Path(self.directory.name) / "journal.json"
            if symlink:
                path.symlink_to(Path(self.directory.name) / "missing")
            else:
                path.write_text("unexpected")
            try:
                with self.assertRaisesRegex(ValueError, "action intent"):
                    self.tick(3000000000)
            finally:
                path.unlink()

    def test_readiness_loss_and_worker_change_fail(self):
        self.driver.ready.return_value = False
        with self.assertRaisesRegex(ValueError, "readiness lost"):
            self.tick(3000000000)
        self.driver.ready.return_value = True
        self.driver.identity = lambda slots: {"first": "c" * 64, "second": "b" * 64}
        with self.assertRaisesRegex(ValueError, "eligibility lost"):
            self.tick(3000000000)

    def test_condition_or_production_source_cannot_open_driver(self):
        for condition in ("invalid", None):
            with self.assertRaises(ValueError):
                GameActionCost(None, None, None, None, None, None, condition=condition)
        with self.assertRaisesRegex(ValueError, "isolated_game"):
            GameActionCost(
                SimpleNamespace(source="production", control=None),
                None,
                None,
                None,
                None,
                None,
                condition="unchanged",
            )

    def test_v2_handles_slow_snapshot_with_fixed_eight_second_window(self):
        from live_probe_control.action_cost_protocol import METHOD_V2, SCHEDULE_V2

        self.driver.method, self.driver.schedule = METHOD_V2, SCHEDULE_V2
        self.target_at = 6800000000
        self.finish("action")
        self.assertEqual(
            [
                e["script_age_ns"]
                for e in self.driver.edges
                if e["label"].endswith("_start")
            ],
            [3000000000, 8000000000, 14000000000],
        )
        self.assertEqual(self.events[-1]["reserved_ns"], 7000000000)

    def test_v2_cannot_wait_past_eight_seconds_for_target_stability(self):
        from live_probe_control.action_cost_protocol import METHOD_V2, SCHEDULE_V2

        self.driver.method, self.driver.schedule = METHOD_V2, SCHEDULE_V2
        self.driver.condition = "action"
        self.target_at = 7800000000
        with self.assertRaisesRegex(ValueError, "not stable"):
            for age in range(3000000000, 8050000000, 50000000):
                self.tick(age)

    def test_verified_restore_mixed_native_cache_uses_continuity_until_fresh_admission(
        self,
    ):
        self.driver.ready.side_effect = lambda slots, continuity=False: (
            continuity or not 11200000000 <= self.age < 11800000000
        )
        self.finish("action")
        self.assertTrue(self.driver.result_seen)
        self.assertEqual(self.events[-1]["journal_state"], "clean")

    def test_restored_window_still_requires_strict_admission_readiness(self):
        self.driver.ready.side_effect = lambda slots, continuity=False: (
            continuity or self.age < 14000000000
        )
        with self.assertRaisesRegex(ValueError, "restoration not stable"):
            self.finish("action")
