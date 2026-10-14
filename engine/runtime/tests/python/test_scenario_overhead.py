"""Actual orchestration with fake clocks/runtime; no playback or pressure runs."""

import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from camera_trace import HostTraceRecording
from camera_trace_config import ENGINE_EVENTS, TraceConfig
from scenario_harness.camera_runtime import Availability, WorkloadDeclaration
from scenario_harness.contracts import Counters, Resource
from scenario_harness.overhead import ORDER, run_overhead
from test_scenario_campaign import plan


class FakeRuntime:
    def __init__(self, camera, peer, lease, workload):
        self.camera = camera
        self.lease = lease

    def preflight(self, *args):
        return Availability(
            "available",
            None,
            tuple(
                dict(
                    kind="linux_x11",
                    python_version="3.14.4",
                    node_version="26.4.0",
                    gst_version="1.28.2",
                    cpu_allocation=2,
                    width=1280,
                    height=720,
                    fps=30,
                    codec="vp8",
                    clock_source="python_monotonic_ns",
                    clock_resolution_ns=1,
                ).items()
            ),
        )

    def prepare(self, *args):
        return (Resource("workload", "a" * 32, "b" * 32), Resource("recording", "c" * 32, "d" * 32))

    def open(self, *args):
        pass

    def counters(self):
        return Counters(self.camera.clock[0] * 30 // 1_000_000_000, 0, 0)

    def wait_until(self, deadline, budget):
        budget.check()
        self.camera.clock[0] = deadline
        budget.check()

    def owns(self, *args):
        return True

    def restore(self, *args):
        return self.camera.restored


class FakeSwitch:
    def __init__(self, runtime):
        self.camera = runtime.camera

    def set(self, enabled, costs=None):
        self.camera.enabled = enabled
        self.camera.diagnostic = costs is not None
        if not enabled:
            return None
        if costs is not None:
            for i in range(1000):
                costs.observe(i + 100)
        ticks = [0]
        recording = HostTraceRecording(
            TraceConfig(budget_ns=50_000_000), lambda: ticks[0], resolution_ns=1
        )
        stream = recording.begin()
        recording.capture(stream, 0)
        for b in ENGINE_EVENTS[1:]:
            ticks[0] += 1_000_000
            recording.endpoint(stream, b, 0)
        recording.finish()
        return recording


class OverheadTests(unittest.TestCase):
    def execute(self, restored=True, cancelled=False):
        context = tempfile.TemporaryDirectory()
        self.addCleanup(context.cleanup)
        root = Path(context.name).resolve()
        camera = SimpleNamespace(
            peers={"peer": object()},
            clock=[0],
            enabled=False,
            diagnostic=False,
            restored=restored,
            N5_WORKLOAD_DECLARATION=WorkloadDeclaration("workload-1", 7, "26.4.0"),
        )
        schedule = plan()
        schedule["trials"] = [
            dict(
                run_id=f"run-{i + 1}",
                source_id=f"{i + 1:032x}",
                scenario="healthy",
                assignment="engineering",
                repeat_index=i + 1,
            )
            for i in range(10)
        ]
        with (
            patch("scenario_harness.overhead.LinuxCameraRuntime", FakeRuntime),
            patch("scenario_harness.overhead.TraceSwitch", FakeSwitch),
            patch("scenario_harness.overhead.time.monotonic_ns", lambda: camera.clock[0]),
            patch(
                "scenario_harness.overhead.time.process_time_ns",
                lambda: (
                    camera.clock[0]
                    * (22 if camera.diagnostic else 21 if camera.enabled else 20)
                    // 100
                ),
            ),
        ):
            result = run_overhead(camera, root, schedule, lambda: cancelled and camera.clock[0] > 0)
        return root, result

    def test_all_pairs_diagnostics_and_export_times_retained_in_frozen_order(self):
        root, result = self.execute()
        self.assertEqual(result["state"], "completed")
        self.assertEqual(
            [(t["pair"], t["mode"]) for t in result["trials"]],
            [(i, m) for i, modes in enumerate(ORDER, 1) for m in modes],
        )
        self.assertEqual(
            [t["cpu_ns"] for t in result["trials"]],
            [6_000_000_000 if t["mode"] == "disabled" else 6_300_000_000 for t in result["trials"]],
        )
        self.assertEqual(result["diagnostic"]["observed_probes"], 1000)
        self.assertEqual(len(result["diagnostic"]["probe_durations_ns"]), 1000)
        self.assertEqual(len(list((root / "campaign-1").glob("*.tar.gz"))), 5)
        self.assertTrue(
            all(
                t["export_duration_ns"] is not None
                for t in result["trials"]
                if t["mode"] == "enabled"
            )
        )

    def test_restoration_failure_cannot_be_completed(self):
        root, result = self.execute(restored=False)
        self.assertEqual((result["state"], result["reason"]), ("failed", "cleanup_failed"))
        self.assertFalse(result["cleanup_verified"])
        self.assertIn('"state":"dirty"', (root / "journal.json").read_text())

    def test_cancelled_prefix_is_retained_without_fabricated_pairs(self):
        _, result = self.execute(cancelled=True)
        self.assertEqual((result["state"], result["reason"]), ("failed", "cancelled"))
        self.assertEqual(result["trials"], [])
        self.assertIsNone(result["diagnostic"])
        self.assertTrue(result["cleanup_verified"])


if __name__ == "__main__":
    unittest.main()
