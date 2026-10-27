"""No success inferred from missing outcomes, reset reservations or dirty-state bypass."""

import copy
import unittest

from live_probe_control.game_failure_screen import CASES, METHOD, ORDER, assess
from test_game_control_disturbance_screen import game_acquisition


def cohort():
    rows = [game_acquisition()]
    quality = copy.deepcopy(rows[0]["control_windows"][0]["quality"][1])
    for mode, case in zip(ORDER[1:], CASES, strict=True):
        clean = case == "cancel"
        request = {"request_id": "request", "target_fps": 24, "duration_ns": 2000000000,
                   "generation": {"owner": "owner", "pipeline": "pipeline", "peer": "peer"}}
        run = {"mode": mode, "case": case, "status": "passed", "method": METHOD, "role": "contained_game_failure_not_qualification",
               "live_authority": False, "context": copy.deepcopy(rows[0]["context"]), "browser": rows[0]["browser"],
               "sibling_quality": copy.deepcopy(quality), "events": [],
               "viewers": [{"failures": int(case in ("source-loss", "receiver-loss")), "bindings": 3, "unbound": 1},
                           {"failures": 0, "bindings": 2, "unbound": 1}]}
        result = {"request_id": "request", "outcome": "aborted", "restoration": "verified_by_port" if clean else "unknown",
                  "reason": "cancelled" if clean else "restore_failed", "live_authority": False}
        run["events"] = [
            {"kind": "camera_ready", "mode": mode, "source": "isolated_game"},
            {"kind": "control_capture_bound", "method": METHOD, "scope": "owned_x99_game_display", "binding_hash": "d" * 64, "live_authority": False},
            {"kind": "game_failure_dispatched", "method": METHOD, "case": case, "request": request, "live_authority": False},
            {"kind": "game_failure_fault", "method": METHOD, "case": case, "target_observed": True},
            {"kind": "game_failure_result", "method": METHOD, "case": case, "result": result, "ledger_state": "clean" if clean else "dirty", "actions": 1, "reserved_ns": 4000000000},
            {"kind": "game_failure_verified", "method": METHOD, "case": case, "old_exit": 0 if clean else -9, "old_reaped": True,
             "stale_handles_rejected": True, "owner_restarted": True, "old_owner_rejected": True, "dirty_blocked": not clean,
             "clean_draft_allowed": clean, "source_restored": case == "source-loss", "game_progress": True, "sibling_progress": True,
             "sibling_identity_retained": True, "ledger_state": "clean" if clean else "dirty", "actions": 1, "reserved_ns": 4000000000, "live_authority": False},
            {"kind": "complete", "game_alive": True, "worker_cleanup": True},
        ]
        if case == "source-loss":
            run["events"].insert(4, {"kind": "game_failure_source_restored", "method": METHOD, "case": case})
        if clean or case == "reconnect":
            run["events"].insert(4, {"kind": "game_failure_reconnect", "method": METHOD, "case": case})
        rows.append(run)
    return rows


class FailureScreenTests(unittest.TestCase):
    def test_all_cases_only_establish_contained_failure_handling(self):
        result = assess(cohort())
        self.assertEqual(result["failure_screen"], "met")
        self.assertFalse(result["live_authority"])
        self.assertEqual(result["qualification"], "unavailable_contained_game_engineering_only")

    def test_missing_case_or_changed_context_cannot_pass(self):
        self.assertEqual(assess(cohort()[:-1])["failure_screen"], "unavailable")
        rows = cohort()
        rows[3]["context"]["software_hash"] = "c" * 64
        self.assertEqual(assess(rows)["failure_screen"], "unavailable")

    def test_failed_case_retained_and_later_cases_still_assessed(self):
        rows = cohort()
        rows[2] = {"mode": ORDER[2], "status": "failed", "live_authority": False}
        result = assess(rows)
        self.assertEqual(result["failure_screen"], "unavailable")
        self.assertEqual(len(result["cases"]), 5)
        self.assertEqual(result["cases"][-1]["state"], "measured")

    def test_unknown_result_never_turns_into_verified_restoration(self):
        rows = cohort()
        event = next(e for e in rows[2]["events"] if e["kind"] == "game_failure_result")
        event["result"]["restoration"] = "verified_by_port"
        self.assertEqual(assess(rows)["failure_screen"], "unavailable")
        event["result"] = None
        result = assess(rows)
        self.assertEqual(result["failure_screen"], "met")
        self.assertEqual(result["cases"][2]["restoration"], "unavailable_no_result")

    def test_reset_reservation_or_dirty_bypass_or_replaced_sibling_cannot_pass(self):
        for key, value in (("reserved_ns", 0), ("dirty_blocked", False), ("sibling_identity_retained", False)):
            rows = cohort()
            next(e for e in rows[4]["events"] if e["kind"] == "game_failure_verified")[key] = value
            self.assertEqual(assess(rows)["failure_screen"], "unavailable")

    def test_missing_source_restore_or_bad_sibling_window_cannot_pass(self):
        rows = cohort()
        rows[3]["events"] = [e for e in rows[3]["events"] if e["kind"] != "game_failure_source_restored"]
        self.assertEqual(assess(rows)["failure_screen"], "unavailable")
        rows = cohort()
        rows[1]["sibling_quality"]["frames"] = [f for i, f in enumerate(rows[1]["sibling_quality"]["frames"]) if i % 2 == 0]
        for f in rows[1]["sibling_quality"]["frames"]:
            f["presented"] //= 2
        self.assertEqual(assess(rows)["failure_screen"], "not_met")
