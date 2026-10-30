"""Versioned planning declarations preserve v1 and never qualify execution."""

import copy
import json
import tempfile
import unittest
from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path
from unittest.mock import patch

from live_probe_control import qualification_protocol as v1
from live_probe_control import qualification_protocol_v2 as v2
from live_probe_control.contracts import digest


def declared():
    value = v2.draft()
    value["context"].update(
        image="sha256:" + "a" * 64, software_hash="b" * 64, browser="test-browser"
    )
    for row in value["cost_limits"].values():
        row.update(
            maximum=1,
            rationale="Invented test value, not approved",
            review_reference="unverified-test",
        )
    for row in value["quality"].values():
        row.update(
            procedure="invented-test",
            criterion="invented-test",
            review_reference="unverified-test",
        )
    for name, row in value["fault_scope"].items():
        row.update(
            disposition="required",
            procedure=v2.FAULT_PROCEDURES[name],
            rationale="invented-test",
            review_reference="unverified-test",
        )
    for row in value["exclusions"].values():
        row.update(
            disposition="accepted",
            rationale="invented-test",
            review_reference="unverified-test",
        )
    value["protocol_review"].update(
        revision="invented-test",
        review_reference="unverified-test",
        independence_rationale="invented-test",
    )
    return value


class QualificationProtocolV2Tests(unittest.TestCase):
    def test_v1_inventory_and_hash_remain_frozen_and_versions_do_not_autoconvert(self):
        original = v1.draft()
        self.assertEqual(
            digest(original),
            "dc9d28d00c35bd93b057d11ed4f978db0b787996544fbbba7c2d4011f793ff6f",
        )
        self.assertEqual(len(original["cost_limits"]), 11)
        self.assertEqual(v1.inspect(original)["document_hash"], digest(original))
        self.assertEqual(v1.inspect(v2.draft())["protocol_state"], "invalid")
        self.assertEqual(v2.inspect(original)["protocol_state"], "invalid")

    def test_new_draft_exposes_all_cost_decisions_and_separate_fault_reservation(self):
        value = v2.draft()
        before = copy.deepcopy(value)
        result = v2.inspect(value)
        self.assertEqual(result["method"], v2.METHOD)
        self.assertEqual(result["protocol_state"], "draft_incomplete", result)
        self.assertEqual(len(value["cost_limits"]), 14)
        self.assertEqual(result["proposed_reservation_ns"], 7000000000)
        self.assertEqual(result["proposed_fault_reservation_ns"], 4000000000)
        for case in v2.COST_INTERVALS:
            self.assertIn(
                "cost_limits.fault_" + case + "_cpu.maximum",
                result["missing_decisions"],
            )
            self.assertIn(
                "fault_scope." + case + ".disposition", result["missing_decisions"]
            )
        self.assertEqual(value, before)

    def test_complete_declarations_remain_unverified_and_without_authority(self):
        result = v2.inspect(declared())
        self.assertEqual(
            result["protocol_state"], "complete_declarations_unverified", result
        )
        self.assertFalse(result["live_authority"])
        self.assertFalse(result["review_verified"])
        self.assertEqual(
            result["qualification"], "unavailable_protocol_is_not_evidence"
        )
        self.assertEqual(result["activation"], "not_implemented_by_this_tool")

    def test_whole_camera_interval_and_exact_required_procedures_cannot_be_substituted(
        self,
    ):
        for mutation in (
            "interval",
            "unit",
            "procedure",
            "scope_procedure",
            "combined_scope",
            "missing_slot",
        ):
            with self.subTest(mutation=mutation):
                value = declared()
                if mutation == "interval":
                    value["cost_limits"]["fault_whole_camera_death_cpu"]["interval"] = (
                        "before_dispatch_through_cleanup_callbacks"
                    )
                elif mutation == "unit":
                    value["cost_limits"]["fault_controller_thread_exit_cpu"]["unit"] = (
                        "percentage_point"
                    )
                elif mutation == "procedure":
                    value["procedures"]["whole_camera_death"] = v2.FAULT_PROCEDURES[
                        "controller_thread_exit"
                    ]
                elif mutation == "scope_procedure":
                    value["fault_scope"]["controller_thread_block"]["procedure"] = (
                        v2.FAULT_PROCEDURES["controller_thread_exit"]
                    )
                elif mutation == "combined_scope":
                    value["fault_scope"]["controller_thread_only_failure"] = value[
                        "fault_scope"
                    ].pop("controller_thread_exit")
                else:
                    del value["cost_limits"]["fault_controller_thread_exit_cpu"]
                self.assertEqual(v2.inspect(value)["protocol_state"], "invalid")

    def test_fault_operation_remains_two_seconds_with_fixed_typed_budget(self):
        for mutation in ("duration", "reservation", "float", "bool", "policy"):
            value = declared()
            if mutation == "duration":
                value["fault_operation"]["requested_duration_ns"] = 5000000000
            elif mutation == "reservation":
                value["fault_operation"]["reserved_duration_ns"] = 7000000000
            elif mutation == "float":
                value["fault_operation"]["baseline_fps"] = 30.0
            elif mutation == "bool":
                value["fault_operation"]["policy"]["maximum_actions"] = True
            else:
                value["fault_operation"]["policy"]["maximum_duration_ns"] = 5000000000
            self.assertEqual(v2.inspect(value)["protocol_state"], "invalid", mutation)

    def test_new_limits_and_camera_tail_exclusion_remain_required_decisions(self):
        value = declared()
        value["cost_limits"]["fault_whole_camera_death_cpu"]["maximum"] = None
        value["exclusions"][
            "later_camera_death_relay_monitor_interpreter_container_browser_exit"
        ]["review_reference"] = None
        result = v2.inspect(value)
        self.assertEqual(result["protocol_state"], "draft_incomplete")
        for limit in (True, float("nan"), float("inf"), -1):
            value = declared()
            value["cost_limits"]["fault_controller_thread_block_cpu"]["maximum"] = limit
            self.assertEqual(v2.inspect(value)["protocol_state"], "invalid")

    def test_v2_cli_reports_completeness_without_modifying_file(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "protocol.json"
            for value, exit_code, state in (
                (v2.draft(), 1, "draft_incomplete"),
                (declared(), 0, "complete_declarations_unverified"),
                (v1.draft(), 1, "invalid"),
            ):
                body = json.dumps(value).encode()
                path.write_bytes(body)
                out = StringIO()
                with (
                    patch("sys.argv", ["qualification_protocol_v2", str(path)]),
                    redirect_stdout(out),
                ):
                    self.assertEqual(v2.main(), exit_code)
                result = json.loads(out.getvalue())
                self.assertEqual(result["protocol_state"], state, result)
                self.assertFalse(result["live_authority"])
                self.assertEqual(path.read_bytes(), body)
