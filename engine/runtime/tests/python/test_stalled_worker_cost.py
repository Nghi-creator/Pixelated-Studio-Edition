"""Invented interruption/lifetime evidence, independent of acquisition output."""

import copy
import unittest
from test_fault_cost_screen import cohort as fault_cohort
from live_probe_control.contracts import digest
from live_probe_control.stalled_worker_cost_screen import METHOD, MODE, summarize


def acquisition():
    run = fault_cohort()[-1]
    run.update(
        method=METHOD,
        mode=MODE,
        case="worker-stall",
        role="contained_game_stalled_worker_cost_not_qualification",
    )
    events = [
        e
        for e in run["events"]
        if e["kind"] != "failure_lifetime" and e["kind"] != "game_failure_reconnect"
    ]
    for e in events:
        if (
            "method" in e
            and e["kind"] != "container_cost_started"
            and e["kind"] != "container_cost_finished"
        ):
            e["method"] = METHOD
        if "case" in e:
            e["case"] = "worker-stall"
        if e["kind"] == "camera_ready":
            e["mode"] = MODE
        if e["kind"] in ("game_failure_result", "game_failure_verified"):
            e["ledger_state"] = "active"
        if e["kind"] == "game_failure_result":
            e["result"] = None
            e["operation_status"] = "worker_lost"
    request = next(e for e in events if e["kind"] == "game_failure_dispatched")[
        "request"
    ]
    projection = dict(state="active", actions=1, reserved_ns=4000000000)
    rows = []
    capture = next(e for e in events if e["kind"] == "control_capture_bound")[
        "binding_hash"
    ]
    for i, phase in enumerate(
        ("active_target", "replacement_ready", "issuer_restarted")
    ):
        peers = {}
        for name in ("first", "second") if i == 0 else ("replacement", "second"):
            peers[name] = dict(
                process=dict(
                    identity_hash={"first": "a", "second": "b", "replacement": "c"}[
                        name
                    ]
                    * 64
                ),
                generation=copy.deepcopy(request["generation"]),
                token_hash=name,
                offer_hash=name,
                native=dict(
                    configured_fps=24 if name == "first" else 30,
                    negotiated_fps=24 if name == "first" else 30,
                    width=640,
                    height=480,
                    target_bitrate=1500000,
                    cpu_used=6,
                    max_quantizer=48,
                    encoded_buffers=10 + i,
                ),
            )
        row = dict(
            kind="failure_lifetime",
            method="n10-contained-game-lifetime-observations-v1",
            case="worker-stall",
            phase=phase,
            live_authority=False,
            capture_hash=capture,
            issuer_epoch=1 if i < 2 else 2,
            read_start_ns=i * 100 + 1,
            read_end_ns=i * 100 + 2,
            processes={
                name: dict(identity_hash=hex(index + 1)[2:] * 64, cpu_ticks=i)
                for index, name in enumerate(("camera", "game", "display"))
            },
            peers=peers,
            journal=dict(
                projection=projection.copy(),
                projection_hash=digest(projection),
                directory_hash="d" * 64,
                private_content_hash="e" * 64,
            ),
            old_process=None
            if i == 0
            else dict(identity_hash="a" * 64, returncode=-9, supervisor_exit_code=-9),
        )
        rows.append(row)
    events.insert(
        next(i for i, e in enumerate(events) if e["kind"] == "game_failure_fault"),
        rows[0],
    )
    index = next(
        i for i, e in enumerate(events) if e["kind"] == "game_failure_verified"
    )
    events[index:index] = rows[1:]
    run["events"] = events
    run["viewers"][0]["failures"] = 1
    return run


class StalledCostTests(unittest.TestCase):
    def test_unresolved_active_intent_and_missing_result_are_preserved(self):
        result = summarize(acquisition())
        self.assertEqual(result["cost_screen"], "met", result)
        self.assertEqual(result["method"], METHOD)
        self.assertEqual(result["lifecycle"]["ledger_state"], "active")
        self.assertEqual(result["lifecycle"]["restoration"], "unavailable_no_result")
        self.assertEqual(result["cost_limits"], "not_evaluated")
        self.assertFalse(result["live_authority"])

    def test_no_fabricated_result_cleared_budget_replaced_source_or_reused_worker(self):
        for mutation in ("result", "journal", "old", "source", "binding"):
            run = acquisition()
            rows = [e for e in run["events"] if e["kind"] == "failure_lifetime"]
            if mutation == "result":
                next(e for e in run["events"] if e["kind"] == "game_failure_result")[
                    "result"
                ] = {}
            elif mutation == "journal":
                rows[-1]["journal"]["projection"]["reserved_ns"] = 0
            elif mutation == "old":
                rows[-1]["old_process"]["returncode"] = 0
            elif mutation == "source":
                rows[-1]["processes"]["game"]["identity_hash"] = "f" * 64
            else:
                rows[-1]["peers"]["second"]["offer_hash"] = "foreign"
            self.assertEqual(summarize(run)["cost_screen"], "unavailable", mutation)

    def test_stop_targets_only_the_current_pinned_worker(self):
        import sys
        from pathlib import Path
        from types import SimpleNamespace
        from unittest.mock import patch

        sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts/n10"))
        from fault_cost import StalledWorkerCost

        d = StalledWorkerCost.__new__(StalledWorkerCost)
        d.old_process = SimpleNamespace(poll=lambda: None)
        d.old = SimpleNamespace(owner=SimpleNamespace(child=d.old_process, pidfd=17))
        with patch("fault_cost.signal.pidfd_send_signal", create=True) as send:
            d.inject_fault()
            send.assert_called_once()
            self.assertEqual(send.call_args.args[0], 17)
            d.old.owner.child = object()
            with self.assertRaisesRegex(ValueError, "exact live"):
                d.inject_fault()
            self.assertEqual(send.call_count, 1)
