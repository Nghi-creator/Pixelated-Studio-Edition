"""Closed opt-in source route selection, without a native runtime or collection."""

import sys
import unittest
from pathlib import Path

RUNTIME = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(RUNTIME))
sys.path.insert(0, str(RUNTIME / "scripts/research/n10"))
from condition_observation import ConditionObservation
from research.resource_observation.contained_condition import ResourceConditionObservation
from research.resource_observation.modes import condition_mode, condition_observer_class


class ResourceModeTests(unittest.TestCase):
    def test_all_condition_routes_select_explicit_class(self):
        for condition in ("no_injected_fault", "owned_identity_delay", "owned_cpu_pressure"):
            for resource in (False, True):
                with self.subTest(condition=condition, resource=resource):
                    mode = (
                        "engineering-n11-"
                        + ("resource-" if resource else "")
                        + "condition-"
                        + condition
                    )
                    self.assertEqual(
                        condition_mode(mode), dict(condition=condition, resource=resource)
                    )
                    self.assertIs(
                        condition_observer_class(resource),
                        ResourceConditionObservation if resource else ConditionObservation,
                    )

    def test_unknown_prefix_alias_and_nonstrings_rejected(self):
        for mode in (
            None,
            True,
            "engineering-n11-resource-condition-healthy",
            "engineering-n11-condition-no_injected_fault;cmd",
            "engineering-n11-resource-resource-condition-no_injected_fault",
        ):
            self.assertIsNone(condition_mode(mode))
        for flag in (None, 1, "true"):
            with self.assertRaises(ValueError):
                condition_observer_class(flag)


if __name__ == "__main__":
    unittest.main()
