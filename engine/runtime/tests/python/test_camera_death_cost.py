"""Invented whole-camera observations and monitor ownership rejection tests."""

import copy
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from live_probe_control.camera_death_cost_screen import METHOD, MODE, assess
from live_probe_control.contracts import digest
from test_thread_block_cost import acquisition as block_acquisition

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts/n10"))
import camera_death as fixture


def acquisition():
    base = block_acquisition()
    request = next(
        e["request"] for e in base["events"] if e["kind"] == "game_failure_dispatched"
    )
    native = next(e["peers"] for e in base["events"] if e["kind"] == "failure_lifetime")
    pins = {
        name: char * 64
        for name, char in zip(
            ("camera", "first", "second", "game", "display", "pulse"), "abcdef"
        )
    }
    projection = dict(
        state="active",
        active=request["request_id"],
        actions=1,
        reserved_ns=4000000000,
        history=[
            dict(
                request=request,
                request_hash=digest(request),
                process_hash=pins["first"],
                result=None,
                failure=None,
            )
        ],
    )
    journal = dict(
        projection=projection,
        projection_hash=digest(projection),
        private_content_hash="a" * 64,
        directory_hash="b" * 64,
    )

    def event(kind, **values):
        return dict(kind=kind, method=METHOD, live_authority=False, **values)

    def point(kind, phase, i):
        return event(
            kind,
            phase=phase,
            sample=dict(
                read_start_ns=i * 1000000000,
                read_end_ns=i * 1000000000 + 1000,
                usage_usec=i * 100000,
                user_usec=i * 60000,
                system_usec=i * 40000,
            ),
        )

    events = [
        dict(kind="camera_ready", source="isolated_game", mode=MODE),
        point("fault_cost_checkpoint", "before_dispatch", 1),
        event("game_failure_dispatched", request=request),
        event("game_failure_fault", target_observed=True),
        point("fault_cost_checkpoint", "fault_injected", 2),
        event("camera_death_armed"),
        event(
            "camera_death_pinned",
            identities=pins,
            workers={
                name: copy.deepcopy(native[name]["native"])
                for name in ("first", "second")
            },
            journal=copy.deepcopy(journal),
        ),
        point("camera_death_cost_checkpoint", "before_camera_kill", 3),
        dict(kind="camera_process_exit", code=None, signal="SIGKILL"),
        point("camera_death_cost_checkpoint", "workers_exited", 4),
        point("camera_death_cost_checkpoint", "cleanup_finished", 5),
        event(
            "camera_death_verified",
            journal=copy.deepcopy(journal),
            workers_exit_observed=True,
            worker_lifetimes_absent=True,
            source_alive_before_cleanup=True,
            source_cleanup=True,
            residual_descendants=0,
            restart_dispatch_blocked=True,
            controller_result=None,
            restoration="unavailable_camera_died",
        ),
        event("complete", whole_camera_cleanup=True),
    ]
    return dict(
        base,
        method=METHOD,
        mode=MODE,
        case="camera-death",
        role="contained_camera_death_cost_not_qualification",
        events=events,
    )


class CameraDeathCostTests(unittest.TestCase):
    def test_camera_death_cost_preserves_unknown_result_and_unresolved_journal(self):
        result = assess([acquisition()])
        self.assertEqual(result["cost_screen"], "met", result)
        self.assertEqual(result["journal_state"], "active")
        self.assertEqual(result["cost_limits"], "not_evaluated")
        self.assertFalse(result["live_authority"])

    def test_missing_guards_cleanup_reaping_or_budget_can_never_pass(self):
        for mutation in (
            "workers",
            "cleanup",
            "reaping",
            "budget",
            "result",
            "identity",
            "rate",
            "cost",
            "camera_signal",
        ):
            with self.subTest(mutation=mutation):
                run = acquisition()
                verified = next(
                    e for e in run["events"] if e["kind"] == "camera_death_verified"
                )
                pinned = next(
                    e for e in run["events"] if e["kind"] == "camera_death_pinned"
                )
                if mutation == "workers":
                    verified["workers_exit_observed"] = False
                elif mutation == "cleanup":
                    verified["source_cleanup"] = False
                elif mutation == "reaping":
                    verified["worker_lifetimes_absent"] = False
                elif mutation == "budget":
                    verified["journal"]["projection"]["reserved_ns"] = 0
                elif mutation == "result":
                    verified["controller_result"] = {}
                elif mutation == "identity":
                    pinned["identities"]["first"] = pinned["identities"]["second"]
                elif mutation == "rate":
                    pinned["workers"]["first"]["negotiated_fps"] = 30
                elif mutation == "cost":
                    run["events"] = [
                        e for e in run["events"] if e.get("phase") != "workers_exited"
                    ]
                else:
                    next(
                        e for e in run["events"] if e["kind"] == "camera_process_exit"
                    )["signal"] = "SIGTERM"
                self.assertEqual(assess([run])["cost_screen"], "unavailable")
        self.assertEqual(assess([block_acquisition()])["cost_screen"], "unavailable")

    def test_foreign_camera_marker_is_rejected_before_any_signal(self):
        with (
            tempfile.TemporaryDirectory() as directory,
            patch.object(fixture, "directory_value", return_value=Path(directory)),
            patch.object(fixture, "pin", return_value=(17, 100)),
            patch.object(fixture, "read_marker", return_value={}),
            patch.object(fixture.os, "close"),
            patch.object(fixture.signal, "pidfd_send_signal", create=True) as send,
        ):
            with self.assertRaisesRegex(ValueError, "closed"):
                fixture.monitor(123, directory)
            send.assert_not_called()

    def test_parent_or_start_mismatch_cannot_pin_a_signal_target(self):
        with (
            patch.object(fixture, "process_identity", return_value=(8, 20)),
            patch.object(fixture.os, "pidfd_open", create=True) as open_fd,
        ):
            for parent, start in ((7, 20), (8, 21)):
                with self.assertRaisesRegex(ValueError, "lifetime mismatch"):
                    fixture.pin(123, parent, start)
            open_fd.assert_not_called()
