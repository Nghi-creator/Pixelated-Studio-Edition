"""Synthetic trial boundaries: failures are evidence, never live qualification."""

import contextlib
import io
import itertools
import json
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
import live_probe_trial as trial


class Pipeline:
    def __init__(self):
        self.value = 1000000
        self.current = "null"
        self.frames = 0
        self.fail_apply = self.fail_restore = self.fail_teardown = self.no_decode = False
        self.fail_observe = self.change_unrelated = False
        self.mutations = []

    def get_by_name(self, name):
        if name == "encoder":
            return self
        stats = {
            "num-bytes": self.frames * 1000,
            "num-buffers": self.frames,
            "rendered": 0 if self.no_decode else self.frames,
            "dropped": 0,
        }
        return types.SimpleNamespace(
            get_property=lambda _key: types.SimpleNamespace(get_value=lambda key: stats[key])
        )

    def get_property(self, key):
        if key == "target-bitrate":
            return self.value
        return 2 if self.change_unrelated and self.value == 500000 else 1

    def set_property(self, key, value):
        if key != "target-bitrate":
            raise AssertionError("unexpected setter")
        self.mutations.append(value)
        if value == 1000000 and self.fail_restore:
            raise RuntimeError("private restore error")
        self.value = value
        if value == 500000 and self.fail_apply:
            raise RuntimeError("private error after changing property")

    def set_state(self, state):
        if state == "null" and self.fail_teardown:
            raise RuntimeError("private teardown error")
        self.current = state
        return 1

    def get_state(self, _timeout):
        if self.fail_observe and self.current == "playing":
            return 1, "paused", "void-pending"
        return 1, self.current, "void-pending"

    def get_bus(self):
        return self


class TrialTests(unittest.TestCase):
    def execute(self, pipeline):
        gst = types.SimpleNamespace(
            init=lambda _args: None,
            version=lambda: (1, 26, 2, 0),
            parse_launch=lambda text: pipeline if text == trial.PIPELINE else None,
            StateChangeReturn=types.SimpleNamespace(FAILURE=0),
            State=types.SimpleNamespace(
                PLAYING="playing", NULL="null", VOID_PENDING="void-pending"
            ),
            SECOND=1000000000,
        )

        def advance(*_args):
            pipeline.frames += 30

        with patch.object(trial, "wait", side_effect=advance):
            return trial.run(gst, now=itertools.count(0, 1000000000).__next__)

    def test_success_retains_independent_local_observations_without_qualification(self):
        pipeline = Pipeline()
        result = self.execute(pipeline)
        self.assertEqual(result["status"], "observed")
        self.assertEqual(set(result["windows"]), {"baseline", "during", "restoration"})
        self.assertEqual(result["restoration"], "setting_and_local_decode_observed")
        self.assertEqual(result["teardown"], "null_observed")
        self.assertIsNone(result["selected_family"])
        self.assertFalse(result["live_authority"])
        self.assertEqual(result["receiver_continuity"], "not_tested_no_webrtc_receiver")
        self.assertEqual(result["live_relief"], "unavailable_unverified")
        self.assertEqual(pipeline.value, 1000000)
        self.assertEqual(pipeline.current, "null")
        json.dumps(result, allow_nan=False)

    def test_partial_setter_failure_preserves_intent_and_restores_owned_encoder(self):
        pipeline = Pipeline()
        pipeline.fail_apply = True
        result = self.execute(pipeline)
        self.assertEqual(result["status"], "unavailable")
        self.assertIsNone(result["receipts"][0]["after_ns"])
        self.assertEqual(result["restoration"], "setting_only_no_restoration_window")
        self.assertEqual(pipeline.mutations, [500000, 1000000])
        self.assertEqual(pipeline.current, "null")
        self.assertNotIn("private", json.dumps(result))

    def test_failed_restore_is_unknown_even_when_teardown_succeeds(self):
        pipeline = Pipeline()
        pipeline.fail_restore = True
        result = self.execute(pipeline)
        self.assertEqual(result["restoration"], "unknown")
        self.assertEqual(result["reason"], "restore_failed")
        self.assertEqual(result["teardown"], "null_observed")

    def test_teardown_failure_cannot_report_success(self):
        pipeline = Pipeline()
        pipeline.fail_teardown = True
        result = self.execute(pipeline)
        self.assertEqual(result["status"], "unavailable")
        self.assertEqual(result["teardown"], "unknown")

    def test_early_failures_do_not_apply_and_still_teardown(self):
        for field, value in (("value", 123), ("fail_observe", True), ("no_decode", True)):
            with self.subTest(field=field):
                pipeline = Pipeline()
                setattr(pipeline, field, value)
                result = self.execute(pipeline)
                self.assertEqual(result["status"], "unavailable")
                self.assertEqual(pipeline.mutations, [])
                self.assertEqual(pipeline.current, "null")

    def test_unrelated_control_change_aborts(self):
        pipeline = Pipeline()
        pipeline.change_unrelated = True
        result = self.execute(pipeline)
        self.assertEqual(result["status"], "unavailable")
        self.assertEqual(pipeline.value, 1000000)
        self.assertNotIn("restoration", result["windows"])

    def test_interrupt_takes_cleanup_path(self):
        pipeline = Pipeline()
        original = pipeline.set_property

        def interrupt(key, value):
            original(key, value)
            if value == 500000:
                raise KeyboardInterrupt

        pipeline.set_property = interrupt
        result = self.execute(pipeline)
        self.assertEqual(result["status"], "unavailable")
        self.assertEqual(pipeline.value, 1000000)
        self.assertEqual(pipeline.current, "null")

    def test_counter_and_clock_failures_are_not_zero_rates(self):
        start = dict(
            read_start_ns=0,
            read_end_ns=1,
            encoded_bytes=10,
            encoded_buffers=10,
            decoded_frames=10,
            decoded_dropped=0,
        )
        for changes in ({"read_start_ns": 1}, {"encoded_bytes": 0}, {"decoded_frames": 0}):
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                trial.window(start, start | {"read_start_ns": 10, "read_end_ns": 11} | changes)
        for value in (True, -1, 2**53, 1.0, float("nan")):
            with self.assertRaises(ValueError):
                trial.counter(value)

    def test_cli_requires_explicit_opt_in_before_loading_gst(self):
        for args in ([], ["--help"], ["--isolated-bitrate-trial", "extra"]):
            with (
                patch.object(sys, "argv", ["trial", *args]),
                contextlib.redirect_stderr(io.StringIO()),
            ):
                self.assertEqual(trial.main(), 2)

    def test_bus_error_and_deadline_abort(self):
        gst = types.SimpleNamespace(
            MSECOND=1000000, MessageType=types.SimpleNamespace(ERROR=1, EOS=2)
        )
        bus = types.SimpleNamespace(timed_pop_filtered=lambda *_args: object())
        with self.assertRaisesRegex(ValueError, "pipeline_error_or_eos"):
            trial.wait(bus, gst, 1, 5, now=lambda: 0)
        with self.assertRaisesRegex(ValueError, "trial_deadline"):
            trial.wait(bus, gst, 1, 0, now=lambda: 0)

    def test_read_bracket_includes_all_setting_getters(self):
        pipeline = Pipeline()
        pipeline.current = "playing"
        ticks = [0]
        original = pipeline.get_property

        def read(key):
            ticks[0] += 1
            return original(key)

        pipeline.get_property = read
        gst = types.SimpleNamespace(
            StateChangeReturn=types.SimpleNamespace(FAILURE=0),
            State=types.SimpleNamespace(PLAYING="playing", VOID_PENDING="void-pending"),
        )
        row = trial.snapshot(pipeline, gst, now=lambda: ticks[0])
        self.assertEqual(row["read_start_ns"], 0)
        self.assertEqual(row["read_end_ns"], len(trial.UNRELATED) + 1)


if __name__ == "__main__":
    unittest.main()
