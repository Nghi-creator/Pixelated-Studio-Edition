"""Disposable cgroup file doubles validate pinning and cumulative end counters."""

import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts/n10"))
from container_cost import ContainerCost


class ContainerCostTests(unittest.TestCase):
    def test_counter_survives_child_exit_and_finish_is_idempotent(self):
        with tempfile.TemporaryDirectory() as d:
            stats, ns = Path(d) / "cpu.stat", Path(d) / "cgroup"
            stats.write_text("usage_usec 10\nuser_usec 6\nsystem_usec 4\n")
            ns.write_text("0::/\n")
            events = []
            with patch(
                "container_cost.Path",
                side_effect=lambda p: stats if p.endswith("cpu.stat") else ns,
            ):
                c = ContainerCost(
                    lambda kind, **data: events.append(dict(kind=kind, **data))
                )
                stats.write_text("usage_usec 40\nuser_usec 25\nsystem_usec 15\n")
                c.finish(
                    scene_closed=True,
                    pulse_reaped=True,
                    workers_closed=True,
                    active_peers=0,
                )
                c.finish(
                    scene_closed=True,
                    pulse_reaped=True,
                    workers_closed=True,
                    active_peers=0,
                )
            self.assertEqual(len(events), 2)
            self.assertEqual(events[-1]["sample"]["usage_usec"], 40)

    def test_foreign_namespace_and_replaced_counter_cannot_measure_host_cost(self):
        with tempfile.TemporaryDirectory() as d:
            stats, ns = Path(d) / "cpu.stat", Path(d) / "cgroup"
            stats.write_text("usage_usec 10\nuser_usec 6\nsystem_usec 4\n")
            ns.write_text("0::/foreign\n")
            events = []
            with patch(
                "container_cost.Path",
                side_effect=lambda p: stats if p.endswith("cpu.stat") else ns,
            ):
                with self.assertRaisesRegex(ValueError, "private cgroup"):
                    ContainerCost(lambda *a, **k: None)
                ns.write_text("0::/\n")
                c = ContainerCost(
                    lambda kind, **data: events.append(dict(kind=kind, **data))
                )
                stats.rename(Path(d) / "old")
                stats.write_text("usage_usec 0\nuser_usec 0\nsystem_usec 0\n")
                c.finish(
                    scene_closed=True,
                    pulse_reaped=True,
                    workers_closed=True,
                    active_peers=0,
                )
            self.assertIsNone(events[-1]["sample"])
            self.assertIsNotNone(events[-1]["failure"])
