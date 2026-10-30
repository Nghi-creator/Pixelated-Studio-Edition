"""Blocked-thread fixture routing and invented evidence boundary tests."""

import sys
import tempfile
import unittest
from dataclasses import asdict
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from live_probe_control import Generation, Request, Snapshot
from live_probe_control.fault_cost_screen import summarize as fault_summary
from live_probe_control.thread_block_cost_screen import METHOD, MODE, summarize
from test_thread_exit_cost import acquisition as exited_acquisition

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts/n10"))
import game_thread_fault as fixture


def acquisition():
    run = exited_acquisition()
    old = run["method"]
    run.update(
        method=METHOD,
        mode=MODE,
        case="controller-thread-block",
        role="contained_game_controller_thread_block_cost_not_qualification",
    )
    for event in run["events"]:
        if event.get("method") == old:
            event["method"] = METHOD
        if "case" in event:
            event["case"] = run["case"]
        if event["kind"] == "camera_ready":
            event["mode"] = MODE
        if event["kind"] == "controller_thread_exit_observed":
            event.update(
                kind="controller_thread_block_observed",
                control_thread_alive=True,
                injected_at_ns=10,
                observed_at_ns=100000010,
                before_buffers=10,
                after_buffers=13,
            )
    return run


class ThreadBlockCostTests(unittest.TestCase):
    def test_blocked_thread_cost_requires_live_thread_and_post_fault_progress(self):
        result = summarize(acquisition())
        self.assertEqual(result["cost_screen"], "met", result)
        self.assertEqual(result["method"], METHOD)
        self.assertEqual(
            result["lifecycle"]["controller_thread"],
            "blocked_observed_media_progressed_without_result",
        )
        self.assertEqual(result["lifecycle"]["ledger_state"], "active")
        self.assertEqual(result["cost_limits"], "not_evaluated")
        self.assertFalse(result["live_authority"])

    def test_exit_short_progress_and_other_case_cannot_fill_blocked_gate(self):
        for key, value in (
            ("control_thread_alive", False),
            ("observed_at_ns", 100000009),
            ("after_buffers", 12),
            ("before_buffers", True),
            ("kind", "controller_thread_exit_observed"),
        ):
            with self.subTest(key=key):
                run = acquisition()
                e = next(
                    e
                    for e in run["events"]
                    if e["kind"] == "controller_thread_block_observed"
                )
                e[key] = value
                self.assertEqual(summarize(run)["cost_screen"], "unavailable")
        self.assertEqual(summarize(exited_acquisition())["cost_screen"], "unavailable")
        self.assertEqual(fault_summary(acquisition())["cost_screen"], "unavailable")
        self.assertEqual(
            fault_summary(acquisition(), _interruption="foreign")["cost_screen"],
            "unavailable",
        )

    def test_block_hook_parks_only_matching_control_thread_and_reports_progress(self):
        from live_probe_control.peer_control import PeerControl, WorkerProbePort

        request = Request(
            "request", Generation("owner", "pipeline", "peer"), 24, 2000000000
        )
        with tempfile.TemporaryDirectory() as directory:
            fixture.write_marker(
                Path(directory) / fixture.BLOCK_TRIGGER,
                dict(method=METHOD, request=asdict(request)),
            )
            media = SimpleNamespace(
                bootstrap={
                    "body": {
                        "source": "isolated_game",
                        "control": {"directory": directory},
                    }
                },
                snapshot=lambda: dict(
                    configured_fps=24, negotiated_fps=24, encoded_buffers=13
                ),
            )
            port = SimpleNamespace(
                media=media, request=request, last_native={"encoded_buffers": 10}
            )
            control = SimpleNamespace(
                port=port,
                media=media,
                config=SimpleNamespace(directory=directory),
                thread=SimpleNamespace(is_alive=lambda: True),
            )

            def run(*_args, **_kwargs):
                with self.assertRaisesRegex(ValueError, "outlived"):
                    WorkerProbePort.snapshot(port)
                PeerControl.poll(control)
                e = fixture.read_marker(Path(directory) / fixture.BLOCK_OBSERVATION)
                self.assertTrue(e["control_thread_alive"])
                self.assertEqual(e["after_buffers"] - e["before_buffers"], 3)
                self.assertFalse((Path(directory) / fixture.OBSERVATION).exists())

            event = SimpleNamespace(
                wait=lambda duration: self.assertEqual(duration, 10)
            )
            with (
                patch.object(
                    WorkerProbePort,
                    "snapshot",
                    return_value=Snapshot(request.generation, 24, 24, "a" * 64, True),
                ),
                patch.object(PeerControl, "poll"),
                patch.object(fixture.runpy, "run_module", side_effect=run),
                patch.object(
                    fixture.threading,
                    "current_thread",
                    return_value=SimpleNamespace(name="peer-cadence-control"),
                ),
                patch.object(fixture.threading, "Event", return_value=event),
                patch.object(
                    fixture.time, "monotonic_ns", side_effect=[10, 100000010, 100000020]
                ),
                patch.object(sys, "argv", ["fixture", "--dedicated-peer-worker"]),
            ):
                fixture.child_main("block")

    def test_unlisted_fault_kind_cannot_wrap_worker(self):
        for kind in (None, "foreign", "exit-cost"):
            with self.assertRaises(ValueError):
                fixture.peer_subprocess_proxy(kind)
