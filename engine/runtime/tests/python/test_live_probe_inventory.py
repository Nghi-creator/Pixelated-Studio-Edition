"""Read-only N10 metadata boundaries; fake elements do not prove live behavior."""

import ast
import contextlib
import io
import json
import math
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import live_probe_inventory as module

FLAGS = types.SimpleNamespace(READABLE=1, WRITABLE=2, CONSTRUCT_ONLY=8)
GST = types.SimpleNamespace(
    PARAM_MUTABLE_PLAYING=4096,
    StateChangeReturn=types.SimpleNamespace(FAILURE=0),
    init=lambda _args: None,
    version=lambda: (1, 26, 2, 0),
)
GOBJECT = types.SimpleNamespace(ParamFlags=FLAGS)


def state(current="null", pending="void-pending", result=1):
    return (
        result,
        types.SimpleNamespace(value_nick=current),
        types.SimpleNamespace(value_nick=pending),
    )


class Element:
    def __init__(self, factory="vp8enc", flags=3, value=1000):
        self.factory, self.flags, self.value = factory, flags, value
        self.reads, self.states = [], [state(), state()]
        self.missing = self.fail_read = False

    def get_factory(self):
        return types.SimpleNamespace(get_name=lambda: self.factory)

    def get_state(self, timeout):
        if timeout != 0:
            raise AssertionError("inventory must not wait for a state transition")
        return self.states.pop(0)

    def find_property(self, _name):
        return (
            None
            if self.missing
            else types.SimpleNamespace(
                flags=self.flags,
                minimum=0,
                maximum=2**31 - 1,
                default_value=0,
            )
        )

    def get_property(self, name):
        self.reads.append(name)
        if self.fail_read:
            raise RuntimeError("PRIVATE native identity /secret/path")
        return self.value

    def set_property(self, *_args):
        raise AssertionError("read-only inventory attempted mutation")

    def set_state(self, *_args):
        raise AssertionError("read-only inventory attempted state change")


class InventoryTests(unittest.TestCase):
    def gst(self, make):
        return types.SimpleNamespace(**vars(GST), ElementFactory=types.SimpleNamespace(make=make))

    def test_null_factory_inventory_never_authorizes_or_mutates(self):
        elements = []

        def make(name, instance_name):
            self.assertIsNone(instance_name)
            element = Element(name, FLAGS.READABLE | FLAGS.WRITABLE | GST.PARAM_MUTABLE_PLAYING)
            elements.append(element)
            return element

        report = module.inventory(self.gst(make), GOBJECT)
        self.assertEqual(report["status"], "observed")
        self.assertEqual(report["scope"], "fresh_null_elements_only")
        self.assertEqual(len(report["elements"]), 3)
        self.assertEqual(sum(len(e.reads) for e in elements), 10)
        self.assertFalse(report["live_authority"])
        self.assertIsNone(report["selected_family"])
        self.assertEqual(report["live_relief"], "unavailable_unverified")
        for key in ("application", "restoration", "receiver_continuity"):
            self.assertEqual(report[key], "not_run")
        self.assertTrue(
            all(p["declared_mutable_playing"] for e in report["elements"] for p in e["properties"])
        )
        json.dumps(report, allow_nan=False)

    def test_missing_flag_is_an_observed_fact_not_proof_of_immutability(self):
        row = module.property_snapshot(Element(), "target-bitrate", "bit_per_second", GST, GOBJECT)
        self.assertEqual(row["status"], "observed")
        self.assertTrue(row["readable"] and row["writable"])
        self.assertFalse(row["declared_mutable_playing"])
        self.assertEqual(row["value"], 1000)

    def test_read_only_and_construct_only_properties_are_not_hidden(self):
        for flags in (FLAGS.READABLE, FLAGS.READABLE | FLAGS.WRITABLE | FLAGS.CONSTRUCT_ONLY):
            with self.subTest(flags=flags):
                row = module.property_snapshot(
                    Element(flags=flags), "cpu-used", "encoder_setting", GST, GOBJECT
                )
                self.assertEqual(row["writable"], bool(flags & FLAGS.WRITABLE))
                self.assertEqual(row["construct_only"], bool(flags & FLAGS.CONSTRUCT_ONLY))

    def test_missing_and_unreadable_properties_do_not_call_getter(self):
        for missing, flags in ((True, 3), (False, FLAGS.WRITABLE)):
            with self.subTest(missing=missing):
                element = Element(flags=flags)
                element.missing = missing
                row = module.property_snapshot(
                    element, "target-bitrate", "bit_per_second", GST, GOBJECT
                )
                self.assertEqual(row["status"], "unavailable")
                self.assertFalse(element.reads)
                self.assertNotIn("value", row)

    def test_property_exceptions_are_private(self):
        element = Element()
        element.fail_read = True
        row = module.property_snapshot(element, "target-bitrate", "bit_per_second", GST, GOBJECT)
        self.assertEqual(row["reason"], "property_read_failed")
        self.assertNotIn("PRIVATE", json.dumps(row))
        self.assertNotIn("/secret", json.dumps(row))

    def test_unsupported_values_remain_unavailable(self):
        for value in (math.inf, math.nan, "PRIVATE", object(), 2**64):
            with self.subTest(value=type(value)):
                row = module.property_snapshot(
                    Element(value=value), "target-bitrate", "bit_per_second", GST, GOBJECT
                )
                self.assertEqual(row["status"], "unavailable")
                self.assertNotIn("value", row)
                json.dumps(row, allow_nan=False)

    def test_factory_absence_mismatch_and_unknown_name(self):
        self.assertEqual(
            module.element_snapshot(None, "vp8enc", GST, GOBJECT)["reason"], "element_missing"
        )
        element = Element("foreign")
        self.assertEqual(
            module.element_snapshot(element, "vp8enc", GST, GOBJECT)["reason"], "factory_mismatch"
        )
        self.assertFalse(element.reads)
        with self.assertRaisesRegex(ValueError, "unsupported"):
            module.element_snapshot(element, "arbitrary", GST, GOBJECT)
        with self.assertRaisesRegex(ValueError, "unsupported"):
            module.property_snapshot(element, "display-name", "string", GST, GOBJECT)

    def test_state_race_pending_failure_and_unknown_are_unavailable(self):
        for states in (
            [state(), state("ready")],
            [state(pending="playing"), state(pending="playing")],
            [state(result=0)],
            [state("unexpected")],
        ):
            with self.subTest(states=states):
                element = Element()
                element.states = states
                row = module.element_snapshot(element, "vp8enc", GST, GOBJECT)
                self.assertEqual(row["status"], "unavailable")
                self.assertIn(row["reason"], ("state_unstable", "state_unavailable"))

    def test_standalone_inventory_rejects_non_null_factory_instances(self):
        def make(name, _):
            element = Element(name)
            element.states = [state("playing"), state("playing")]
            return element

        report = module.inventory(self.gst(make), GOBJECT)
        self.assertTrue(all(e["reason"] == "unexpected_element_state" for e in report["elements"]))
        self.assertFalse(report["live_authority"])

    def test_one_failed_factory_preserves_other_inventory_results(self):
        def make(name, _):
            if name == "vp8enc":
                raise RuntimeError("PRIVATE")
            return Element(name)

        report = module.inventory(self.gst(make), GOBJECT)
        self.assertEqual(report["elements"][0]["reason"], "element_unavailable")
        self.assertTrue(all(e["status"] == "observed" for e in report["elements"][1:]))
        self.assertNotIn("PRIVATE", json.dumps(report))

    def test_runtime_failure_and_missing_mutability_constant_are_explicit(self):
        def fail(_):
            raise RuntimeError("PRIVATE")

        gst = self.gst(lambda name, _: Element(name))
        gst.init = fail
        report = module.inventory(gst, GOBJECT)
        self.assertEqual(report["reason"], "gstreamer_unavailable")
        self.assertFalse(report["elements"])
        self.assertNotIn("PRIVATE", json.dumps(report))
        row = module.property_snapshot(
            Element(), "target-bitrate", "bit_per_second", types.SimpleNamespace(), GOBJECT
        )
        self.assertEqual(row["status"], "unavailable")
        self.assertNotIn("declared_mutable_playing", row)

    def test_module_has_no_camera_import_setter_or_pipeline_builder(self):
        tree = ast.parse(Path(module.__file__).read_text())
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                self.assertTrue(all(not alias.name.startswith("camera") for alias in node.names))
            if isinstance(node, ast.ImportFrom):
                self.assertFalse((node.module or "").startswith("camera"))
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
                self.assertNotIn(node.func.attr, ("set_property", "set_state", "parse_launch"))

    def test_cli_status_and_argument_rejection(self):
        for status, code in (("observed", 0), ("unavailable", 1)):
            with (
                self.subTest(status=status),
                patch.object(module, "inventory", return_value={"status": status}),
                patch.object(sys, "argv", ["inventory"]),
            ):
                output = io.StringIO()
                with contextlib.redirect_stdout(output):
                    self.assertEqual(module.main(), code)
                self.assertEqual(json.loads(output.getvalue()), {"status": status})
        with (
            patch.object(sys, "argv", ["inventory", "--apply"]),
            patch.object(module, "inventory") as inspect,
        ):
            error = io.StringIO()
            with contextlib.redirect_stderr(error):
                self.assertEqual(module.main(), 2)
            inspect.assert_not_called()
            self.assertEqual(error.getvalue(), "error: inventory accepts no arguments\n")


if __name__ == "__main__":
    unittest.main()
