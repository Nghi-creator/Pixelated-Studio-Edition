"""Independent pacing ownership/effect tests; no live Gst or CPU pressure."""

import gzip
import io
import json
import sys
import tarfile
import unittest
from dataclasses import replace
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from camera_trace import HostTraceRecording
from camera_trace_config import ENGINE_EVENTS, TraceConfig
from scenario_harness.contracts import SECOND, PhaseExecution, RunPlan
from scenario_harness.pacing_export import pacing_bundle_bytes
from scenario_harness.pacing_runtime import CapturePacer
from scenario_adapter_support import execution
from test_scenario_export import declaration


class Element:
    def __init__(self):
        self.value = 0
        self.changes = []

    def get_property(self, name):
        return self.value

    def set_property(self, name, value):
        self.value = value
        self.changes.append(value)


class Timer:
    def __init__(self, seconds, callback):
        self.seconds, self.callback = seconds, callback
        self.cancelled = False

    def start(self):
        pass

    def cancel(self):
        self.cancelled = True


def pacing_inputs(delay=50_000_000, degraded=500):
    plan = RunPlan("run-1", "healthy", 7, (30 * SECOND,) * 6, 0, TraceConfig(every_nth_frame=10))
    phases, frames = [], 0
    for p in execution(workers=0).phases:
        count = degraded if p.phase in ("degraded", "probe") else 900
        rows = tuple(
            (
                p.start_ns + i * SECOND,
                p.start_ns + (i + 1) * SECOND,
                frames + count * i // 30,
                frames + count * (i + 1) // 30,
                0,
                0,
            )
            for i in range(30)
        )
        phases.append(PhaseExecution(p.phase, p.start_ns, p.end_ns, "complete", None, rows))
        frames += count
    run = replace(execution(workers=0), phases=tuple(phases))
    m = declaration(plan)
    m["trace_policy"]["every_nth_frame"] = 10
    m.update(
        schema_version="experiment-manifest-v2",
        method_release="n5-capture-pacing-v1",
        scenario="render_capture_slowdown",
        adapter=dict(adapter_id="bounded_capture_pacing", state="available", reason=None),
        actions=[
            dict(
                action_id="action-1",
                kind="capture_pacing",
                workers=0,
                delay_us=50000,
                start_phase="degraded",
                stop_phase="recovery",
                max_duration_ns=70 * SECOND,
            )
        ],
    )
    recordings = []
    for p in phases[1:5]:
        ticks = [0]
        r = HostTraceRecording(plan.trace_config, lambda ticks=ticks: ticks[0], resolution_ns=1)
        stream = r.begin()
        count = sum(row[3] - row[2] for row in p.intervals)
        d = delay if p.phase in ("degraded", "probe") else 1_000_000
        period = 60_000_000 if p.phase in ("degraded", "probe") else 33_333_333
        for i in range(count):
            ticks[0] = i * period
            r.capture(stream, i)
            for j, b in enumerate(ENGINE_EVENTS[1:]):
                ticks[0] = i * period + d + j * 1_000_000
                r.endpoint(stream, b, i)
        r.finish()
        recordings.append((p.phase, r))
    return m, plan, run, tuple(recordings)


def unpack(payload):
    with tarfile.open(fileobj=io.BytesIO(gzip.decompress(payload)), mode="r:") as archive:
        return {m.name: archive.extractfile(m).read() for m in archive}


class PacingTests(unittest.TestCase):
    def test_owned_setting_and_watchdog_restore_exact_element(self):
        element = Element()
        pacer = CapturePacer(element, lambda: True, Timer)
        pacer.start(70 * SECOND)
        self.assertEqual((element.value, pacer.timer.seconds), (50000, 70))
        pacer.timer.callback()
        self.assertTrue(pacer.expired)
        self.assertEqual(element.value, 0)
        self.assertTrue(pacer.stop())
        self.assertTrue(pacer.timer.cancelled)

    def test_foreign_owner_or_setting_is_never_overwritten(self):
        for foreign in ("owner", "value"):
            with self.subTest(foreign=foreign):
                element = Element()
                owned = [True]
                pacer = CapturePacer(element, lambda owned=owned: owned[0], Timer)
                pacer.start(70 * SECOND)
                if foreign == "owner":
                    owned[0] = False
                else:
                    element.value = 123
                before = list(element.changes)
                self.assertFalse(pacer.stop())
                self.assertEqual(before, element.changes)
                self.assertTrue(pacer.failed)

    def test_timer_start_failure_restores_attempted_setting(self):
        class Broken(Timer):
            def start(self):
                raise OSError("private diagnostic")

        element = Element()
        pacer = CapturePacer(element, lambda: True, Broken)
        with self.assertRaises(OSError):
            pacer.start(70 * SECOND)
        self.assertEqual(element.value, 0)
        self.assertTrue(pacer.started and pacer.failed)

    def test_bounds_and_replay_reject_before_mutation(self):
        for value in (True, 0, 39 * SECOND, 301 * SECOND):
            element = Element()
            with self.assertRaises(ValueError):
                CapturePacer(element, lambda: True, Timer).start(value)
            self.assertEqual(element.changes, [])
        p = CapturePacer(Element(), lambda: True, Timer)
        p.start(70 * SECOND)
        with self.assertRaises(ValueError):
            p.start(70 * SECOND)
        p.stop()

    def test_actual_export_uses_measured_pairs_not_requested_delay(self):
        for delay, reason in ((50_000_000, None), (1_000_000, "pacing_not_observed")):
            m, p, r, recordings = pacing_inputs(delay)
            files = unpack(
                pacing_bundle_bytes(
                    m,
                    p,
                    r,
                    recordings=recordings,
                    action_started_ns=60 * SECOND,
                    action_stopped_ns=120 * SECOND,
                    cleanup_ended_ns=120 * SECOND,
                    restored=True,
                )
            )
            result = json.loads(files["experiment-result.json"])
            self.assertEqual(result["effect"]["reason"], reason)
            self.assertEqual(result["effect"]["capture_delay_ns"], delay)
            self.assertIsNone(result["effect"]["pressure_cpu_percent"])
            self.assertEqual(result["effect"]["degraded_fps"], 500 / 30)

    def test_unknown_cleanup_does_not_fabricate_success(self):
        m, p, r, recordings = pacing_inputs()
        result = json.loads(
            unpack(
                pacing_bundle_bytes(
                    m, p, r, recordings=recordings, action_started_ns=60 * SECOND, restored=True
                )
            )["experiment-result.json"]
        )
        self.assertEqual(
            (result["status"], result["effect"]["reason"]), ("aborted", "incomplete_run")
        )
        self.assertEqual(result["cleanup"]["state"], "unverified")


if __name__ == "__main__":
    unittest.main()
