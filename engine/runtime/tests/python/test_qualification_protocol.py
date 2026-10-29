"""Planning completeness and typed limits can never approve evidence or execution."""

import copy
import json
import tempfile
import unittest
from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path
from unittest.mock import patch
from live_probe_control.qualification_protocol import draft, inspect, main


def declared():
    d = draft()
    d["context"].update(
        image="sha256:" + "a" * 64, software_hash="b" * 64, browser="151.0.7922.34"
    )
    for row in d["cost_limits"].values():
        row.update(
            maximum=1,
            rationale="Invented test limit; not an approval",
            review_reference="unverified_test_claim",
        )
    for row in d["quality"].values():
        row.update(
            procedure="invented_test",
            criterion="invented_test",
            review_reference="unverified_test_claim",
        )
    for row in d["fault_scope"].values():
        row.update(
            disposition="excluded",
            rationale="invented_test",
            review_reference="unverified_test_claim",
        )
    for row in d["exclusions"].values():
        row.update(
            disposition="accepted",
            rationale="invented_test",
            review_reference="unverified_test_claim",
        )
    d["protocol_review"].update(
        revision="test",
        review_reference="unverified_test_claim",
        independence_rationale="invented_test",
    )
    return d


class QualificationProtocolTests(unittest.TestCase):
    def test_draft_preserves_missing_decisions_without_inventing_limits(self):
        value = draft()
        before = copy.deepcopy(value)
        result = inspect(value)
        self.assertEqual(result["protocol_state"], "draft_incomplete", result)
        self.assertIn(
            "cost_limits.action_container_cpu.maximum", result["missing_decisions"]
        )
        self.assertIn(
            "fault_scope.whole_camera_death.disposition", result["missing_decisions"]
        )
        self.assertEqual(value, before)
        self.assertFalse(result["live_authority"])

    def test_complete_declarations_remain_unreviewed_unqualified_and_unexecutable(self):
        result = inspect(declared())
        self.assertEqual(
            result["protocol_state"], "complete_declarations_unverified", result
        )
        self.assertEqual(
            result["qualification"], "unavailable_protocol_is_not_evidence"
        )
        self.assertFalse(result["review_verified"])
        self.assertFalse(result["live_authority"])
        self.assertEqual(result["activation"], "not_implemented_by_this_tool")

    def test_units_procedures_flags_and_operation_cannot_be_substituted(self):
        for mutation in (
            "unit",
            "procedure",
            "authority",
            "retry_bool",
            "rate",
            "uncaptured_rate",
            "reservation",
            "profile_float",
            "unknown",
        ):
            d = declared()
            if mutation == "unit":
                d["cost_limits"]["action_browser_cpu"]["unit"] = "second"
            elif mutation == "procedure":
                d["procedures"]["actual_fault_cost"] = "older_or_newer"
            elif mutation == "authority":
                d["live_authority"] = True
            elif mutation == "retry_bool":
                d["acquisition_rules"]["retries"] = False
            elif mutation == "rate":
                d["operation"]["target_fps"] = 15
            elif mutation == "uncaptured_rate":
                d["operation"]["target_fps"] = 25
            elif mutation == "reservation":
                d["operation"]["policy"]["cumulative_duration_ns"] = 5000000000
            elif mutation == "profile_float":
                d["context"]["profile"]["width"] = 640.0
            else:
                d["approved"] = True
            self.assertEqual(inspect(d)["protocol_state"], "invalid", mutation)

    def test_nonfinite_boolean_fractional_memory_and_unmeasured_scope_are_rejected(
        self,
    ):
        for value in (float("nan"), float("inf"), True, -1):
            d = declared()
            d["cost_limits"]["action_container_cpu"]["maximum"] = value
            self.assertEqual(inspect(d)["protocol_state"], "invalid")
        d = declared()
        d["cost_limits"]["action_first_worker_rss"]["maximum"] = 0.5
        self.assertEqual(inspect(d)["protocol_state"], "invalid")
        d = declared()
        d["exclusions"]["browser_cleanup_exit_rss_gpu"]["disposition"] = "must_measure"
        self.assertEqual(inspect(d)["protocol_state"], "draft_incomplete")

    def test_cli_rejects_malformed_nonfinite_oversized_and_deep_input(self):
        with tempfile.TemporaryDirectory() as directory:
            p = Path(directory) / "protocol.json"
            for text in (
                '{"method":1,"method":2}',
                '{"a":NaN}',
                " " * 65537,
                "[" * 2000 + "0" + "]" * 2000,
            ):
                p.write_text(text)
                out = StringIO()
                with (
                    patch("sys.argv", ["qualification_protocol", str(p)]),
                    redirect_stdout(out),
                ):
                    self.assertEqual(main(), 1)
                result = json.loads(out.getvalue())
                self.assertEqual(result["protocol_state"], "invalid")
                self.assertFalse(result["live_authority"])
