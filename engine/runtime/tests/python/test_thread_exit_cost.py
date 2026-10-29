"""Invented thread-only interruption evidence; never a native acquisition receipt."""

import copy
import sys
import tempfile
import unittest
from dataclasses import asdict
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from live_probe_control import Generation, Request, Snapshot
from live_probe_control.thread_exit_cost_screen import METHOD, MODE, summarize
from test_stalled_worker_cost import acquisition as stopped_acquisition

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts/n10"))
import game_thread_fault as fixture


def acquisition():
    run = stopped_acquisition()
    run.update(
        method=METHOD,
        mode=MODE,
        case="controller-thread-exit",
        role="contained_game_controller_thread_exit_cost_not_qualification",
    )
    for e in run["events"]:
        if e.get("method") == "n10-contained-stalled-worker-cost-v1":
            e["method"] = METHOD
        if "case" in e:
            e["case"] = "controller-thread-exit"
        if e["kind"] == "camera_ready":
            e["mode"] = MODE
    request = next(
        e["request"] for e in run["events"] if e["kind"] == "game_failure_dispatched"
    )
    index = next(
        i for i, e in enumerate(run["events"]) if e["kind"] == "game_failure_result"
    )
    run["events"].insert(
        index,
        dict(
            kind="controller_thread_exit_observed",
            method=METHOD,
            request=copy.deepcopy(request),
            injected_at_ns=10,
            observed_at_ns=20,
            before_buffers=10,
            after_buffers=12,
            configured_fps=24,
            negotiated_fps=24,
            control_thread_alive=False,
            live_authority=False,
        ),
    )
    return run


class ThreadExitCostTests(unittest.TestCase):
    def test_thread_exit_preserves_unknown_restoration_and_reservation(self):
        result = summarize(acquisition())
        self.assertEqual(result["cost_screen"], "met", result)
        self.assertEqual(result["method"], METHOD)
        self.assertEqual(result["lifecycle"]["ledger_state"], "active")
        self.assertEqual(result["cost_limits"], "not_evaluated")
        self.assertFalse(result["live_authority"])

    def test_missing_progress_live_thread_wrong_binding_and_reordered_event_fail(self):
        for mutation in (
            "no_progress",
            "alive",
            "request",
            "order",
            "missing",
            "boolean_counter",
        ):
            with self.subTest(mutation=mutation):
                run = acquisition()
                e = next(
                    e
                    for e in run["events"]
                    if e["kind"] == "controller_thread_exit_observed"
                )
                if mutation == "no_progress":
                    e["after_buffers"] = e["before_buffers"]
                elif mutation == "alive":
                    e["control_thread_alive"] = True
                elif mutation == "request":
                    e["request"]["request_id"] = "foreign"
                elif mutation == "boolean_counter":
                    e["before_buffers"] = True
                elif mutation == "order":
                    run["events"].remove(e)
                    run["events"].append(e)
                else:
                    run["events"].remove(e)
                self.assertEqual(summarize(run)["cost_screen"], "unavailable")

    def test_markers_publish_complete_bytes_and_never_replace_existing_input(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "marker.json"
            fixture.write_marker(path, {"first": 1})
            self.assertEqual(fixture.read_marker(path), {"first": 1})
            with self.assertRaises(FileExistsError):
                fixture.write_marker(path, {"replacement": 2})
            self.assertEqual(fixture.read_marker(path), {"first": 1})
            path.unlink()
            path.symlink_to(Path(directory) / "foreign")
            with self.assertRaises(OSError):
                fixture.read_marker(path)

    def test_fixture_launcher_accepts_only_exact_owned_worker_command(self):
        with patch.object(fixture.subprocess, "Popen") as spawn:
            proxy = fixture.peer_subprocess_proxy()
            with self.assertRaises(ValueError):
                proxy.Popen(["foreign"])
            spawn.assert_not_called()
            proxy.Popen(
                [
                    sys.executable,
                    "-u",
                    "-m",
                    "live_probe_control.peer_worker",
                    "--dedicated-peer-worker",
                ],
                env={},
            )
            self.assertEqual(spawn.call_args.args[0][-1], "--dedicated-peer-worker")
            self.assertIn("-c", spawn.call_args.args[0])

    def test_fixture_exits_only_matching_controller_then_records_main_loop_progress(
        self,
    ):
        from live_probe_control.peer_control import PeerControl, WorkerProbePort

        request = Request(
            "request", Generation("owner", "pipeline", "peer"), 24, 2000000000
        )
        native = dict(configured_fps=24, negotiated_fps=24, encoded_buffers=12)
        for matching in (False, True):
            with tempfile.TemporaryDirectory() as directory:
                marker = dict(method=METHOD, request=asdict(request))
                if not matching:
                    marker["request"]["request_id"] = "foreign"
                fixture.write_marker(Path(directory) / fixture.TRIGGER, marker)
                media = SimpleNamespace(
                    bootstrap={
                        "body": {
                            "source": "isolated_game",
                            "control": {"directory": directory},
                        }
                    },
                    snapshot=lambda: native,
                )
                port = SimpleNamespace(
                    media=media, request=request, last_native={"encoded_buffers": 10}
                )
                control = SimpleNamespace(
                    port=port,
                    media=media,
                    config=SimpleNamespace(directory=directory),
                    thread=SimpleNamespace(is_alive=lambda: False),
                )

                def run(*_args, **_kwargs):
                    if matching:
                        with self.assertRaises(SystemExit):
                            WorkerProbePort.snapshot(port)
                        PeerControl.poll(control)
                        observed = fixture.read_marker(
                            Path(directory) / fixture.OBSERVATION
                        )
                        self.assertEqual(
                            (observed["before_buffers"], observed["after_buffers"]),
                            (10, 12),
                        )
                        self.assertFalse(observed["control_thread_alive"])
                        PeerControl.poll(control)  # No duplicate observation write.
                    else:
                        WorkerProbePort.snapshot(port)
                        self.assertFalse(hasattr(port, "_thread_fault"))

                with (
                    patch.object(
                        WorkerProbePort,
                        "snapshot",
                        return_value=Snapshot(
                            request.generation, 24, 24, "a" * 64, True
                        ),
                    ),
                    patch.object(PeerControl, "poll"),
                    patch.object(fixture.runpy, "run_module", side_effect=run),
                    patch.object(
                        fixture.threading,
                        "current_thread",
                        return_value=SimpleNamespace(name="peer-cadence-control"),
                    ),
                    patch.object(sys, "argv", ["fixture", "--dedicated-peer-worker"]),
                ):
                    fixture.child_main()
