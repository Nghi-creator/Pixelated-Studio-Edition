"""Strict local browser messages and independent descriptive resource arithmetic."""

import copy
import json
import sys
import types
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from live_probe_control.browser_game_worker import (
    STATS,
    GameBrowserPort,
    decode_message,
)
from live_probe_control.game_browser_summary import difference, summarize
from live_probe_control.game_scene import GameScene

S = 1000000000


def acquisition():
    times = (
        [i * S // 30 for i in range(30)]
        + [S + i * S // 24 for i in range(24)]
        + [2 * S + i * S // 30 for i in range(31)]
    )
    windows, observations, resources, stats, visuals = {}, [], [], [], []
    for index, (phase, fps) in enumerate(
        (("baseline", 30), ("during", 24), ("restoration", 30))
    ):
        endpoints = []
        for t in (index * S + 100000000, index * S + 900000000):
            count = sum(value <= t for value in times)
            item = {
                "at_ns": t,
                "configured_fps": fps,
                "negotiated_fps": fps,
                "capture_buffers": count,
                "receiver_frames": count,
                "healthy": True,
            }
            observations.append(item)
            endpoints.append(item)
            cpu = (
                0.3 * min(t, S) + 0.24 * min(max(t - S, 0), S) + 0.3 * max(t - 2 * S, 0)
            )
            resources.append(
                {
                    "at_ns": t,
                    "read_start_ns": t + 1,
                    "read_end_ns": t + 10,
                    "worker_cpu_ns": int(cpu),
                    "game": {"cpu_ticks": t // 100000000, "rss_bytes": 1000 + index},
                }
            )
        windows[phase] = {"start": endpoints[0], "end": endpoints[1]}
        for j, t in enumerate((index * S + 300000000, index * S + 700000000)):
            values = {key: 0 for key in STATS}
            count = sum(value <= t for value in times)
            values.update(
                framesReceived=count,
                framesDecoded=count,
                frameWidth=640,
                frameHeight=480,
            )
            stats.append({"worker_at_ns": t, "browser_at_ns": t + S, "values": values})
            visuals.append({"worker_at_ns": t, "hash": index * 2 + j, "color_bins": 20})
    # Startup black remains retained but outside every declared measured window.
    visuals.insert(0, {"worker_at_ns": 0, "hash": 99, "color_bins": 1})
    return {
        "version": "n10-game-browser-acquisition-v1",
        "live_authority": False,
        "worker_exit_code": 0,
        "failure": None,
        "browser_resources": [
            {"host_at_ns": 0, "cpu_seconds": 1, "inventory_hash": "one"},
            {"host_at_ns": 3 * S, "cpu_seconds": 1.6, "inventory_hash": "one"},
        ],
        "report": {
            "trial_version": "n10-isolated-game-browser-v1",
            "live_authority": False,
            "mode": "changed",
            "windows": windows,
            "observations": observations,
            "resource_samples": resources,
            "browser_stats": stats,
            "visual_samples": visuals,
            "resource_clock_ticks_per_second": 100,
            "teardown": "null_observed",
            "scene_cleanup": "reaped",
            "receiver_timeline": [
                {
                    "pts_ns": t,
                    "browser_at_ns": t + S,
                    "worker_at_ns": t,
                    "presented_frames": i + 1,
                }
                for i, t in enumerate(times)
            ],
        },
    }


class GameBrowserTests(unittest.TestCase):
    def test_ports_cannot_claim_dedicated_process_on_import(self):
        self.assertIs(GameBrowserPort.dedicated_process, False)

    def test_valid_browser_message_and_missing_stats_stay_explicit(self):
        data = {
            "type": "stats",
            "browser_at_ns": 1,
            "values": {key: None for key in STATS},
        }
        self.assertEqual(decode_message(json.dumps(data)), data)
        message = {
            "type": "frame",
            "pts_ns": 1,
            "browser_at_ns": 2,
            "presented_frames": 1,
            "width": 640,
            "height": 480,
        }
        self.assertEqual(decode_message(json.dumps(message)), message)

    def test_browser_protocol_rejects_ambiguous_and_unbounded_data(self):
        invalid = [
            b'{"type":"health","type":"answer"}',
            b"[]",
            b"x" * 32769,
            b'{"type":"health","state":"connected","fps":24}',
        ]
        for key, value in (
            ("pts_ns", True),
            ("browser_at_ns", -1),
            ("width", 1280),
            ("height", 480.0),
            ("presented_frames", 0),
        ):
            m = {
                "type": "frame",
                "pts_ns": 1,
                "browser_at_ns": 2,
                "presented_frames": 1,
                "width": 640,
                "height": 480,
            }
            m[key] = value
            invalid.append(json.dumps(m))
        for value in (True, -1, float("nan"), float("inf"), "0"):
            m = {
                "type": "stats",
                "browser_at_ns": 1,
                "values": {key: 0 for key in STATS},
            }
            m["values"]["framesDropped"] = value
            invalid.append(json.dumps(m))
        for item in invalid:
            with (
                self.subTest(item=str(item)[:80]),
                self.assertRaises((ValueError, TypeError)),
            ):
                decode_message(item)

    def test_exact_resource_arithmetic_and_no_clock_alignment(self):
        data = acquisition()
        result = summarize(data)
        self.assertEqual(result["transport_screen"], "met")
        self.assertAlmostEqual(result["phases"]["baseline"]["worker_cpu_percent"], 30)
        self.assertAlmostEqual(result["phases"]["during"]["worker_cpu_percent"], 24)
        self.assertAlmostEqual(result["phases"]["during"]["game_cpu_percent"], 10)
        self.assertAlmostEqual(result["browser_cpu_percent"], 20)
        self.assertAlmostEqual(result["worker_during_to_baseline_cpu_ratio"], 0.8)
        for frame in data["report"]["receiver_timeline"]:
            frame["browser_at_ns"] += 3000 * S
        self.assertEqual(summarize(data)["transport_screen"], "met")
        self.assertFalse(result["live_authority"])
        self.assertEqual(result["perceptual_quality"], "not_evaluated")

    def test_measured_black_or_missing_counter_cannot_pass(self):
        for fault in (
            "black",
            "missing",
            "freeze",
            "drop",
            "pts_reset",
            "presentation_reset",
            "dirty_exit",
        ):
            data = acquisition()
            if fault == "black":
                data["report"]["visual_samples"][2]["color_bins"] = 1
            elif fault in ("freeze", "drop", "missing"):
                key = "freezeCount" if fault == "freeze" else "framesDropped"
                data["report"]["browser_stats"][3]["values"][key] = (
                    None if fault == "missing" else 1
                )
            elif fault == "pts_reset":
                data["report"]["receiver_timeline"][10]["pts_ns"] = 0
            elif fault == "presentation_reset":
                data["report"]["receiver_timeline"][10]["presented_frames"] = 1
            else:
                data["worker_exit_code"] = 137
            with self.subTest(fault=fault):
                self.assertEqual(summarize(data)["transport_screen"], "not_met")

    def test_process_inventory_or_cpu_reset_never_becomes_zero_cost(self):
        for fault in ("inventory", "browser_reset", "worker_reset", "missing"):
            data = acquisition()
            if fault == "inventory":
                data["browser_resources"][-1]["inventory_hash"] = "new"
            elif fault == "browser_reset":
                data["browser_resources"][-1]["cpu_seconds"] = 0
            elif fault == "worker_reset":
                data["report"]["resource_samples"][3]["worker_cpu_ns"] = 0
            else:
                data["report"]["resource_samples"].pop(3)
            result = summarize(data)
            if fault in ("inventory", "browser_reset"):
                self.assertIsNone(result["browser_cpu_percent"])
            else:
                self.assertIsNone(result["phases"]["during"]["worker_cpu_percent"])
        self.assertIsNone(difference({"x": True}, {"x": 1}, "x"))

    def test_summary_requires_a_visual_sample_in_each_measured_phase(self):
        data = acquisition()
        end = data["report"]["windows"]["during"]["end"]["at_ns"]
        data["report"]["visual_samples"] = [
            s for s in data["report"]["visual_samples"] if s["worker_at_ns"] <= end
        ]
        self.assertEqual(summarize(data)["transport_screen"], "not_met")

    def test_summary_does_not_hide_interior_cpu_or_rtp_counter_resets(self):
        data = acquisition()
        middle = copy.deepcopy(data["browser_resources"][0])
        middle.update(host_at_ns=S, cpu_seconds=0)
        data["browser_resources"].insert(1, middle)
        self.assertIsNone(summarize(data)["browser_cpu_percent"])
        data = acquisition()
        start = data["report"]["resource_samples"][2]
        middle = copy.deepcopy(start)
        middle.update(
            at_ns=start["at_ns"] + 100000000,
            read_start_ns=start["read_start_ns"] + 100000000,
            worker_cpu_ns=0,
        )
        data["report"]["resource_samples"].insert(3, middle)
        self.assertIsNone(summarize(data)["phases"]["during"]["worker_cpu_percent"])
        data = acquisition()
        middle = copy.deepcopy(data["report"]["browser_stats"][2])
        middle["worker_at_ns"] += 100000000
        middle["values"]["framesDecoded"] = 0
        data["report"]["browser_stats"].insert(3, middle)
        self.assertEqual(summarize(data)["transport_screen"], "not_met")

    def test_owned_scene_cleanup_reaps_children_even_when_key_release_fails(self):
        scene = GameScene()
        reaped = []
        scene.connection = 1
        scene.held = b"Up"

        def fail(*_):
            raise ValueError("owned key failure")

        scene._key = fail
        scene.x11 = types.SimpleNamespace(XCloseDisplay=lambda _: None)
        scene.game = types.SimpleNamespace(
            terminate=lambda: reaped.append("game"), wait=lambda **_: None
        )
        scene.display = types.SimpleNamespace(
            terminate=lambda: reaped.append("display"), wait=lambda **_: None
        )
        self.assertFalse(scene.close())
        self.assertEqual(reaped, ["game", "display"])


if __name__ == "__main__":
    unittest.main()
