"""Cadence experiment ownership and failure boundaries without Gst or a display."""

import contextlib
import io
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
import live_probe_cadence_trial as trial


class Caps:
    def __init__(self, fps):
        self.fps = fps

    def is_equal(self, other):
        return self.fps == other.fps


class Pipeline:
    def __init__(self):
        self.fps = 30
        self.frames = self.clock = self.pts = 0
        self.state = "null"
        self.fail_apply = self.fail_restore = self.fail_teardown = False
        self.foreign = self.wrong_caps = self.reset_counter = False
        self.setters = []

    def now(self):
        self.clock += 1
        return self.clock

    def get_by_name(self, name):
        if name != "cadence":
            raise AssertionError("unexpected element access")
        return self

    def set_property(self, name, value):
        if name != "caps":
            raise AssertionError("unexpected property setter")
        self.setters.append(value.fps)
        if value.fps == 30 and self.fail_restore:
            raise RuntimeError("PRIVATE restore detail")
        self.fps = value.fps
        if value.fps == 15 and self.fail_apply:
            raise RuntimeError("PRIVATE detail after mutation")

    def get_property(self, name):
        if name != "caps":
            raise AssertionError("unexpected property getter")
        return Caps(self.fps)

    def set_state(self, state):
        if state == "null" and self.fail_teardown:
            raise RuntimeError("PRIVATE teardown detail")
        self.state = state
        return 1

    def get_state(self, _timeout):
        return 1, self.state, "void-pending"

    def advance(self, _pipeline, _gst, seconds, _deadline, timeline, _elapsed):
        for _ in range(self.fps * seconds):
            step = 10**9 // self.fps
            self.clock += step
            self.pts += step
            timeline.append(dict(pts_ns=self.pts, observed_at_ns=self.clock))
            self.frames += 1

    def snapshot(self, _pipeline, _gst, elapsed):
        frames = 0 if self.reset_counter and self.fps == 15 and self.frames > 300 else self.frames
        return dict(
            read_start_ns=elapsed(),
            read_end_ns=elapsed(),
            setting=1000000,
            encoded_bytes=frames * 1000,
            encoded_buffers=frames,
            decoded_frames=frames,
            decoded_dropped=0,
            capture_buffers=frames,
            configured_fps=self.fps,
            negotiated_fps=30 if self.wrong_caps else self.fps,
            unrelated=dict(cpu_used=6 if self.foreign and self.fps == 15 else 8),
        )


def gst(pipeline):
    def caps(text):
        if text not in trial.CAPS.values():
            raise AssertionError("unbounded caps")
        return Caps(next(fps for fps, value in trial.CAPS.items() if text == value))

    return types.SimpleNamespace(
        init=lambda _args: None,
        version=lambda: (1, 26, 2, 0),
        parse_launch=lambda _text: pipeline,
        Caps=types.SimpleNamespace(from_string=caps),
        SECOND=10**9,
        State=types.SimpleNamespace(PLAYING="playing", NULL="null", VOID_PENDING="void-pending"),
        StateChangeReturn=types.SimpleNamespace(FAILURE=0),
    )


class CadenceTests(unittest.TestCase):
    def test_caps_snapshot_supports_borrowed_and_legacy_structures(self):
        for borrowed in (False, True):
            opened = [False]

            def require_open(value, borrowed=borrowed, opened=opened):
                if borrowed and not opened[0]:
                    raise AssertionError("structure read outside borrowed lifetime")
                return value

            fields = types.SimpleNamespace(
                get_fraction=lambda _key, read=require_open: read((True, 30, 1)),
                get_value=lambda key, read=require_open: read(640 if key == "width" else 360),
            )

            @contextlib.contextmanager
            def borrow(opened=opened, fields=fields):
                opened[0] = True
                try:
                    yield fields
                finally:
                    opened[0] = False

            caps = types.SimpleNamespace(
                get_size=lambda: 1,
                get_structure=lambda _index, borrow=borrow, borrowed=borrowed, fields=fields: (
                    borrow() if borrowed else fields
                ),
            )
            values = {
                "captured": types.SimpleNamespace(
                    get_property=lambda _key: types.SimpleNamespace(get_value=lambda _field: 10)
                ),
                "capture": types.SimpleNamespace(
                    get_static_pad=lambda _key, caps=caps: types.SimpleNamespace(
                        get_current_caps=lambda caps=caps: caps
                    )
                ),
                "cadence": types.SimpleNamespace(get_property=lambda _key, caps=caps: caps),
            }
            pipeline = types.SimpleNamespace(get_by_name=values.__getitem__)
            with patch.object(trial, "snapshot", return_value=dict(read_start_ns=0)):
                row = trial.cadence_snapshot(pipeline, None, lambda: 100)
            self.assertEqual(row["configured_fps"], 30)
            self.assertEqual(row["negotiated_fps"], 30)
            self.assertFalse(opened[0])

    def execute(self, pipeline, sham=False):
        with (
            patch.object(trial, "collect", side_effect=pipeline.advance),
            patch.object(trial, "cadence_snapshot", side_effect=pipeline.snapshot),
        ):
            return trial.run(gst(pipeline), sham=sham, now=pipeline.now)

    def test_changed_and_sham_screens_do_not_qualify_live_control(self):
        for sham in (False, True):
            with self.subTest(sham=sham):
                pipeline = Pipeline()
                result = self.execute(pipeline, sham)
                self.assertEqual(result["assessment"]["status"], "met")
                self.assertEqual(result["status"], "observed")
                self.assertEqual(result["restoration"], "caps_and_local_cadence_observed")
                self.assertEqual(result["teardown"], "null_observed")
                self.assertFalse(result["live_authority"])
                self.assertIsNone(result["selected_family"])
                self.assertEqual(result["receiver_continuity"], "not_tested_no_webrtc_receiver")
                self.assertEqual(pipeline.fps, 30)
                self.assertEqual(pipeline.state, "null")
                self.assertEqual(pipeline.setters, [30 if sham else 15, 30, 30])

    def test_partial_setter_failure_restores_and_keeps_incomplete_receipt(self):
        pipeline = Pipeline()
        pipeline.fail_apply = True
        result = self.execute(pipeline)
        self.assertEqual(result["status"], "unavailable")
        self.assertIsNone(result["receipts"][0]["after_ns"])
        self.assertEqual(result["restoration"], "caps_only_no_restoration_window")
        self.assertEqual(pipeline.fps, 30)
        self.assertEqual(pipeline.state, "null")
        self.assertNotIn("PRIVATE", str(result))

    def test_restore_and_teardown_failures_cannot_report_success(self):
        for field, reason in (
            ("fail_restore", "restore_failed"),
            ("fail_teardown", "teardown_failed"),
        ):
            with self.subTest(field=field):
                pipeline = Pipeline()
                setattr(pipeline, field, True)
                result = self.execute(pipeline)
                self.assertEqual(result["status"], "unavailable")
                self.assertEqual(result["reason"], reason)

    def test_foreign_settings_or_failed_negotiation_abort(self):
        for field in ("foreign", "wrong_caps"):
            pipeline = Pipeline()
            setattr(pipeline, field, True)
            result = self.execute(pipeline)
            self.assertEqual(result["status"], "unavailable")
            self.assertEqual(pipeline.fps, 30)
            self.assertEqual(pipeline.state, "null")

    def test_counter_reset_retains_failed_read_brackets(self):
        pipeline = Pipeline()
        pipeline.reset_counter = True
        result = self.execute(pipeline)
        self.assertEqual(result["status"], "unavailable")
        self.assertEqual(result["windows"]["during"]["reason"], "counter_delta_failed")
        self.assertIn("start", result["windows"]["during"])
        self.assertIn("end", result["windows"]["during"])

    def test_interruption_uses_cleanup_path(self):
        pipeline = Pipeline()
        original = pipeline.set_property

        def interrupt(name, value):
            original(name, value)
            if value.fps == 15:
                raise KeyboardInterrupt

        pipeline.set_property = interrupt
        result = self.execute(pipeline)
        self.assertEqual(result["status"], "unavailable")
        self.assertEqual(pipeline.fps, 30)
        self.assertEqual(pipeline.state, "null")

    def test_unknown_protocol_and_unowned_display_are_rejected(self):
        for kwargs in (dict(source="camera"), dict(source="x11"), dict(sham="yes")):
            with self.assertRaises(ValueError):
                trial.run(None, **kwargs)
        with (
            patch.object(sys, "argv", ["trial", "--display", ":99"]),
            contextlib.redirect_stderr(io.StringIO()),
        ):
            self.assertEqual(trial.main(), 2)

    def test_pts_reversal_or_large_gaps_fail_screen(self):
        result = self.execute(Pipeline())
        for timeline in (
            [],
            [dict(pts_ns=2, observed_at_ns=0), dict(pts_ns=1, observed_at_ns=1)],
            [dict(pts_ns=0, observed_at_ns=0), dict(pts_ns=250000001, observed_at_ns=1)],
            [dict(pts_ns=0, observed_at_ns=0), dict(pts_ns=1, observed_at_ns=500000001)],
        ):
            self.assertEqual(trial.assess(result["windows"], timeline, False)["status"], "not_met")

    def test_exact_rate_and_timestamp_boundaries(self):
        result = self.execute(Pipeline())
        timeline = [
            dict(pts_ns=0, observed_at_ns=0),
            dict(pts_ns=250000000, observed_at_ns=500000000),
        ]
        self.assertEqual(trial.assess(result["windows"], timeline, False)["status"], "met")
        for count, expected in ((108, True), (132, True), (107, False), (133, False)):
            result["windows"]["baseline"]["capture_buffers"] = count
            # Use an exact four-second interval rather than the simulated read brackets.
            result["windows"]["baseline"]["end"]["read_start_ns"] = (
                result["windows"]["baseline"]["start"]["read_start_ns"] + 4 * 10**9
            )
            self.assertEqual(
                trial.assess(result["windows"], timeline, False)["checks"][
                    "baseline_capture_buffers"
                ],
                expected,
            )

    def test_collect_retains_pts_outside_callbacks_and_rejects_missing_pts(self):
        gst_values = types.SimpleNamespace(
            MSECOND=1000000,
            CLOCK_TIME_NONE=999,
            MessageType=types.SimpleNamespace(ERROR=1, EOS=2),
        )
        for pts in (1, 999):
            sample = types.SimpleNamespace(
                get_buffer=lambda pts=pts: types.SimpleNamespace(pts=pts)
            )
            sink = types.SimpleNamespace(emit=unittest.mock.Mock(side_effect=[sample, None]))
            pipeline = types.SimpleNamespace(
                get_bus=lambda: types.SimpleNamespace(timed_pop_filtered=lambda *_args: None),
                get_by_name=lambda _name, sink=sink: sink,
            )
            timeline = []
            with patch.object(trial.time, "monotonic", side_effect=[0, 0, 0, 2]):
                if pts == 999:
                    with self.assertRaises(ValueError):
                        trial.collect(pipeline, gst_values, 1, 5, timeline, lambda: 0)
                else:
                    trial.collect(pipeline, gst_values, 1, 5, timeline, lambda: 0)
                    self.assertEqual(timeline, [dict(pts_ns=1, observed_at_ns=0)])

    def test_x11_allocates_display_via_owned_child_and_reaps_it(self):
        pipeline = Pipeline()
        child = types.SimpleNamespace(
            poll=lambda: None, terminate=lambda: None, wait=lambda **_kw: 0
        )
        expected = dict(status="observed", live_authority=False)
        with (
            patch.object(trial.os, "pipe", return_value=(101, 102)),
            patch.object(trial.os, "close"),
            patch.object(trial.os, "read", return_value=b"7\n"),
            patch.object(trial.select, "select", return_value=([101], [], [])),
            patch.object(trial.subprocess, "Popen", return_value=child) as spawn,
            patch.object(trial, "run", return_value=expected.copy()) as run,
        ):
            result = trial.run_x11(gst(pipeline), False)
        self.assertEqual(spawn.call_args.kwargs["pass_fds"], (102,))
        self.assertIn("-displayfd", spawn.call_args.args[0])
        self.assertEqual(run.call_args.kwargs["owned_display"], 7)
        self.assertEqual(result["display_cleanup"], "reaped")

    def test_x11_invalid_display_reply_never_runs_capture(self):
        for data in (b"", b":99\n", b"65536\n", b"7"):
            child = types.SimpleNamespace(
                poll=lambda: None, terminate=lambda: None, wait=lambda **_kw: 0
            )
            with (
                patch.object(trial.os, "pipe", return_value=(101, 102)),
                patch.object(trial.os, "close"),
                patch.object(trial.os, "read", return_value=data),
                patch.object(trial.select, "select", return_value=([101], [], [])),
                patch.object(trial.subprocess, "Popen", return_value=child),
                patch.object(trial, "run") as run,
            ):
                result = trial.run_x11(None, False)
            run.assert_not_called()
            self.assertEqual(result["status"], "unavailable")
            self.assertEqual(result["display_cleanup"], "reaped")


if __name__ == "__main__":
    unittest.main()
