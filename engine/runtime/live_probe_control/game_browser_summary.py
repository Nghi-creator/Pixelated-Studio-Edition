"""Offline descriptive engineering summary; no qualification or cross-clock mapping."""

import itertools
import json
import math
import sys

from .browser_game_worker import strict_object
from .contracts import SECOND
from .webrtc_worker import rate_met


def difference(first, last, key):
    a, b = first.get(key), last.get(key)
    if type(a) not in (int, float) or type(b) not in (int, float):
        return None
    if not math.isfinite(a) or not math.isfinite(b) or not 0 <= a <= b <= 2**53 - 1:
        return None
    return b - a


def summarize(acquisition):
    if acquisition.get("version") != "n10-game-browser-acquisition-v1":
        raise ValueError("unsupported game/browser acquisition")
    raw = acquisition.get("report") or {}
    if raw.get("trial_version") != "n10-isolated-game-browser-v1":
        raise ValueError("missing game/browser report")
    if (
        raw.get("live_authority") is not False
        or acquisition.get("live_authority") is not False
    ):
        raise ValueError("live authority forbidden")
    result = {
        "method": "n10-game-browser-engineering-summary-v1",
        "live_authority": False,
        "qualification": "unavailable_engineering_only",
        "perceptual_quality": "not_evaluated",
        "resource_scope": "worker_and_game_linux_cpu_separate_owned_browser_host_cpu",
        "quality_scope": "temporal_and_nonblank_samples_only",
        "mode": raw["mode"],
        "phases": {},
    }
    for phase, target in (
        ("baseline", 30),
        ("during", 30 if raw["mode"] == "sham" else 24),
        ("restoration", 30),
    ):
        window = raw.get("windows", {}).get(phase)
        item = {
            "state": "unavailable",
            "target_fps": target,
            "source_fps": None,
            "presentation_fps": None,
            "worker_cpu_percent": None,
            "game_cpu_percent": None,
            "peak_game_rss_bytes": None,
            "browser_counter_deltas": None,
        }
        result["phases"][phase] = item
        if window is None:
            continue
        a, b = window["start"], window["end"]
        wall = b["at_ns"] - a["at_ns"]
        if wall <= 0:
            continue
        valid = True
        for field, output in (
            ("capture_buffers", "source_fps"),
            ("receiver_frames", "presentation_fps"),
        ):
            delta = difference(a, b, field)
            if delta is None:
                valid = False
                continue
            item[output] = delta * SECOND / wall
            valid = valid and rate_met(delta, wall, target)
        between = [
            o
            for o in raw.get("observations", [])
            if a["at_ns"] <= o["at_ns"] <= b["at_ns"]
        ]
        valid = (
            valid
            and bool(between)
            and all(
                o["healthy"] is True
                and o["configured_fps"] == o["negotiated_fps"] == target
                for o in between
            )
        )
        resources = [
            s
            for s in raw.get("resource_samples", [])
            if a["at_ns"] <= s["at_ns"] <= b["at_ns"]
        ]
        if (
            resources
            and resources[0]["at_ns"] == a["at_ns"]
            and resources[-1]["at_ns"] == b["at_ns"]
        ):
            first, last = resources[0], resources[-1]
            duration = last["read_start_ns"] - first["read_start_ns"]
            cpu = difference(first, last, "worker_cpu_ns")
            game = difference(first["game"], last["game"], "cpu_ticks")
            ticks = raw.get("resource_clock_ticks_per_second")
            if duration > 0 and cpu is not None:
                item["worker_cpu_percent"] = 100 * cpu / duration
            if duration > 0 and game is not None and type(ticks) is int and ticks > 0:
                item["game_cpu_percent"] = 100 * game * SECOND / (ticks * duration)
            item["peak_game_rss_bytes"] = max(s["game"]["rss_bytes"] for s in resources)
        stats = [
            s
            for s in raw.get("browser_stats", [])
            if a["at_ns"] <= s["worker_at_ns"] <= b["at_ns"]
        ]
        if len(stats) >= 2:
            values = {
                key: difference(stats[0]["values"], stats[-1]["values"], key)
                for key in stats[0]["values"]
            }
            item["browser_counter_deltas"] = values
            # These samples cover their own retained subinterval, not an invented window endpoint.
            item["browser_counter_interval"] = [
                stats[0]["worker_at_ns"],
                stats[-1]["worker_at_ns"],
            ]
            valid = (
                valid
                and values.get("framesDropped") == 0
                and values.get("freezeCount") == 0
            )
        else:
            valid = False
        item["state"] = "met" if valid else "not_met"
    frames = raw.get("receiver_timeline", [])
    continuity = len(frames) >= 2 and all(
        0 < b["pts_ns"] - a["pts_ns"] <= 250000000
        and 0 <= b["browser_at_ns"] - a["browser_at_ns"] <= 500000000
        and 0 <= b["worker_at_ns"] - a["worker_at_ns"] <= 500000000
        and b["presented_frames"] > a["presented_frames"]
        for a, b in itertools.pairwise(frames)
    )
    windows = raw.get("windows", {})
    visuals = [
        sample
        for sample in raw.get("visual_samples", [])
        if any(
            window["start"]["at_ns"] <= sample["worker_at_ns"] <= window["end"]["at_ns"]
            for window in windows.values()
        )
    ]
    result["received_image_varies_nonblank"] = len(
        {s["hash"] for s in visuals}
    ) >= 3 and all(s["color_bins"] >= 4 for s in visuals)
    result["presentation_continuity"] = continuity
    result["transport_screen"] = (
        "met"
        if (
            continuity
            and result["received_image_varies_nonblank"]
            and all(p["state"] == "met" for p in result["phases"].values())
            and acquisition.get("worker_exit_code") == 0
            and not acquisition.get("failure")
            and raw.get("teardown") == "null_observed"
            and raw.get("scene_cleanup") == "reaped"
        )
        else "not_met"
    )
    browser = acquisition.get("browser_resources", [])
    result["browser_cpu_percent"] = None
    result["browser_cpu_reason"] = "missing_or_changed_inventory"
    if len(browser) >= 2 and len({s["inventory_hash"] for s in browser}) == 1:
        delta = difference(browser[0], browser[-1], "cpu_seconds")
        duration = browser[-1]["host_at_ns"] - browser[0]["host_at_ns"]
        if delta is not None and duration > 0:
            result["browser_cpu_percent"] = 100 * delta * SECOND / duration
            result["browser_cpu_reason"] = None
    before, during = (
        result["phases"]["baseline"]["worker_cpu_percent"],
        result["phases"]["during"]["worker_cpu_percent"],
    )
    result["worker_during_to_baseline_cpu_ratio"] = (
        during / before
        if before is not None and before > 0 and during is not None
        else None
    )
    return result


def main():
    if len(sys.argv) != 2:
        print("error: one acquisition file required", file=sys.stderr)
        return 2
    try:
        with open(sys.argv[1], "rb") as source:
            data = source.read(2 * 1024 * 1024 + 1)
        if len(data) > 2 * 1024 * 1024:
            raise ValueError("acquisition size limit")
        result = summarize(json.loads(data, object_pairs_hook=strict_object))
    except (OSError, ValueError, TypeError, KeyError, AttributeError, OverflowError):
        print("error: invalid game/browser acquisition", file=sys.stderr)
        return 1
    print(json.dumps(result, indent=2, sort_keys=True, allow_nan=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
