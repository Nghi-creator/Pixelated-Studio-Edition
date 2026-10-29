"""Host-only cost gate cannot accept a foreign marker or dispatch without browser start."""

import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts/n10"))
from fault_cost import FaultCostAcceptance


class FaultCostGateTests(unittest.TestCase):
    def test_absent_marker_waits_only_until_fixed_deadline(self):
        d = FaultCostAcceptance.__new__(FaultCostAcceptance)
        d.gated = False
        d.origin = 1000000000
        d.case = "cancel"
        with (
            tempfile.TemporaryDirectory() as folder,
            patch("fault_cost.Path", return_value=Path(folder) / "absent"),
        ):
            with patch("fault_cost.time.monotonic_ns", return_value=2000000000):
                self.assertFalse(d.tick())
            with patch("fault_cost.time.monotonic_ns", return_value=10000000000):
                with self.assertRaisesRegex(ValueError, "deadline"):
                    d.tick()
        self.assertFalse(d.gated)

    def test_foreign_case_marker_cannot_open_fixture(self):
        d = FaultCostAcceptance.__new__(FaultCostAcceptance)
        d.gated = False
        d.origin = 1000000000
        d.case = "cancel"
        with tempfile.TemporaryDirectory() as folder:
            p = Path(folder) / "marker"
            p.write_text(
                '{"method":"n10-contained-game-fault-cost-v1","case":"source-loss","peers":["first","second"]}'
            )
            with (
                patch("fault_cost.Path", return_value=p),
                patch("fault_cost.time.monotonic_ns", return_value=2000000000),
            ):
                with self.assertRaisesRegex(ValueError, "mismatch"):
                    d.tick()
        self.assertFalse(d.gated)
