"""Fixed offline temporal/observer-cost screen. Never qualifies a relief capability."""

import itertools
import json
import math
import re
import sys

from .browser_game_worker import strict_object

METHOD = "n10-observer-disturbance-v1"
ORDER = ("observer-off", "observer-on", "observer-on", "observer-off", "observer-off", "observer-on")
PAIRS = ((0, 1), (3, 2), (4, 5))
# Engineering budgets chosen before the independent cohort, not estimated cutoffs.
LIMITS = (("parent_cpu", 5), ("workers_cpu", 10), ("relay_cpu", 5), ("browser_cpu", 10),
          ("parent_peak_rss", 8 * 1024**2), ("relay_peak_rss", 8 * 1024**2), ("workers_peak_rss", 16 * 1024**2))


def number(value):
    if type(value) not in (int, float) or not math.isfinite(value) or not 0 <= value <= 2**53 - 1:
        raise ValueError("missing/nonfinite/negative measurement")
    return value


def delta(samples, key, *, integral=True):
    values = [number(sample[key]) for sample in samples]
    if integral and any(type(value) is not int for value in values):
        raise ValueError("fractional counter")
    if len(values) < 2 or any(b < a for a, b in itertools.pairwise(values)):
        raise ValueError("missing/reset counter")
    return values[-1] - values[0]


def increasing(values, maximum_gap):
    return len(values) >= 2 and all(0 < b - a <= maximum_gap for a, b in itertools.pairwise(values))


def browser_screen(data, *, require_visual_variation=True, measurement_ms=4000, expected_fps=30):
    if measurement_ms not in (2000, 4000) or expected_fps not in (24, 30):
        raise ValueError("closed measurement duration/rate required")
    if data["basis"] != "browser_performance_relative_ms" or data["failure"] is not None:
        raise ValueError("browser measurement unavailable")
    duration = number(data["duration_ms"])
    frames, stats, visuals = data["frames"], data["stats"], data["visuals"]
    if not measurement_ms <= duration <= measurement_ms + 500 or not 2 <= len(frames) <= 300 or not 2 <= len(stats) <= 32 or not 2 <= len(visuals) <= 16:
        raise ValueError("measurement window/sample bound")
    frame_times = [number(s["at_ms"]) for s in frames]
    pts = [number(s["pts_ms"]) for s in frames]
    stats_times = [number(s["at_ms"]) for s in stats]
    if not increasing(stats_times, 500) or stats_times[0] > 500 or duration - stats_times[-1] > 500:
        raise ValueError("stats clock/coverage gap")
    presented, decoded = delta(frames, "presented"), delta(stats, "decoded")
    dropped, freezes = delta(stats, "dropped"), delta(stats, "freezes")
    span, stats_span = frame_times[-1] - frame_times[0], stats_times[-1] - stats_times[0]
    if span <= 0 or any(t > duration for t in (*frame_times, *stats_times)):
        raise ValueError("browser window reversed/outside bounds")
    fps, decode_fps = 1000 * presented / span, 1000 * decoded / stats_span
    for s in visuals:
        number(s["at_ms"]); number(s["hash"]); number(s["color_bins"])
    met = (data["connection_state"] == "connected" and 0.9 * expected_fps <= fps <= 1.1 * expected_fps and 0.9 * expected_fps <= decode_fps <= 1.1 * expected_fps
           and increasing(frame_times, 250) and increasing(pts, 250)
           and frame_times[0] <= 250 and duration - frame_times[-1] <= 250
           and dropped == freezes == 0
           and all(s["width"] == 640 and s["height"] == 480 for s in (*frames, *stats))
           and all(s["color_bins"] >= 4 and 0 <= s["at_ms"] <= duration for s in visuals)
           and (not require_visual_variation or len({s["hash"] for s in visuals}) >= 3))
    return {"met": met, "presented_fps": fps, "decoded_fps": decode_fps, "new_dropped": dropped, "new_freezes": freezes}


def resources(run, *, require_game_progress=True, duration_ns=4500000000):
    if duration_ns not in (2500000000, 4500000000):
        raise ValueError("closed native measurement duration required")
    native = [event for event in run["events"] if event["kind"] == "screen_native"]
    if len(native) != 1 or native[0]["basis"] != "linux_monotonic_brackets_exact_owned_process_ticks":
        raise ValueError("native screen missing")
    samples = native[0]["samples"]
    minimum, maximum = (10, 14) if duration_ns == 2500000000 else (16, 24)
    if not minimum <= len(samples) <= maximum:
        raise ValueError("native sample bound")
    stamps = [number(s["read_start_ns"]) for s in samples]
    if not increasing(stamps, 500000000) or not duration_ns <= stamps[-1] - stamps[0] <= duration_ns + 500000000:
        raise ValueError("native window/clock gap")
    if any(not 0 <= number(s["read_end_ns"]) - s["read_start_ns"] <= 50000000 for s in samples):
        raise ValueError("native read bracket unavailable")
    ticks = number(native[0]["ticks_per_second"])
    if ticks <= 0:
        raise ValueError("process tick rate unavailable")
    wall = stamps[-1] - stamps[0]
    scale = 100 * 10**9 / (ticks * wall)
    parent = [s["parent"] for s in samples]
    relay = [s["relay"] for s in samples]
    workers = [[s["workers"][key] for s in samples] for key in ("first", "second")]
    game_ticks = delta([s["game"] for s in samples], "cpu_ticks")
    if require_game_progress and game_ticks <= 0:
        raise ValueError("game progress unavailable")
    for peer in workers:
        if delta(peer, "capture_buffers") <= 0 or delta(peer, "encoded_buffers") <= 0:
            raise ValueError("native source progress unavailable")
    browser = run["browser_resources"]
    a, b = browser["before"], browser["after"]
    if browser["basis"] != "host_hrtime_browser_owned_process_cpu_separate_clock" or not a["inventory_hash"] or (a["inventory_hash"], a["process_count"]) != (b["inventory_hash"], b["process_count"]):
        raise ValueError("browser process inventory changed")
    duration = number(b["host_at_ns"]) - number(a["host_at_ns"])
    if not duration_ns - 500000000 <= duration <= duration_ns + 500000000:
        raise ValueError("browser resource window unavailable")
    return {"parent_cpu": scale * delta(parent, "cpu_ticks"), "relay_cpu": scale * delta(relay, "cpu_ticks"),
            "relay_peak_rss": max(number(s["rss_bytes"]) for s in relay),
            "workers_cpu": scale * sum(delta(peer, "cpu_ticks") for peer in workers),
            "browser_cpu": 100 * 10**9 * delta([a, b], "cpu_seconds", integral=False) / duration,
            "parent_peak_rss": max(number(s["rss_bytes"]) for s in parent),
            "workers_peak_rss": max(sum(number(peer[index]["rss_bytes"]) for peer in workers) for index in range(len(samples)))}


def acquisition_context(run):
    context = run["context"]
    if type(context) is not dict or set(context) != {"image", "software_hash", "host_platform", "host_arch"}:
        raise ValueError("closed acquisition context required")
    if not re.fullmatch(r"sha256:[a-f0-9]{64}", context["image"]) or not re.fullmatch(r"[a-f0-9]{64}", context["software_hash"]):
        raise ValueError("pinned image/software hash required")
    if not all(type(v) is str and 0 < len(v) <= 128 for v in (context["host_platform"], context["host_arch"], run["browser"])):
        raise ValueError("host/browser context unavailable")
    return (json.dumps(context, sort_keys=True), run["browser"])


def evaluate_run(run, identity, *, on_mode="observer-on"):
    if run["status"] != "passed" or run["live_authority"] is not False:
        raise ValueError("incomplete acquisition or live authority")
    key = acquisition_context(run)
    if identity is not None and identity != key:
        raise ValueError("cohort software/image/browser/context changed")
    ready = [e for e in run["events"] if e["kind"] == "camera_ready"]
    complete = [e for e in run["events"] if e["kind"] == "complete"]
    if len(ready) != 1 or ready[0]["source"] != "production" or ready[0]["mode"] != run["mode"] or len(complete) != 1 or complete[0]["worker_cleanup"] is not True or complete[0]["game_alive"] is not True:
        raise ValueError("production source/cleanup proof unavailable")
    if len(run["quality"]) != 2:
        raise ValueError("two real viewer windows required")
    if len(run["viewers"]) != 2 or any(v["failures"] != 0 or v["unbound"] != (1 if run["mode"] == on_mode else 0) for v in run["viewers"]):
        raise ValueError("observer condition/lifecycle mismatch")
    return {"mode": run["mode"], "state": "measured", "viewers": [browser_screen(data) for data in run["quality"]],
            "resources": resources(run)}, key


def assess_cohort(runs, *, method, order, evaluate, pair_check=None):
    result = {"method": method, "live_authority": False, "qualification": "unavailable_engineering_only",
              "perceptual_quality": "not_evaluated", "observer_screen": "unavailable", "runs": [], "pairs": []}
    try:
        if type(runs) is not list or len(runs) != 6 or tuple(r["mode"] for r in runs) != order:
            raise ValueError("complete predeclared order required")
        identity, missing = None, []
        for index, run in enumerate(runs):
            try:
                row, identity = evaluate(run, identity)
                result["runs"].append(row)
            except (ValueError, KeyError, TypeError, IndexError, OverflowError) as exc:
                missing.append(str(index) + ": " + str(exc))
                result["runs"].append({"mode": run["mode"], "state": "unavailable", "reason": str(exc)})
        for off, on in PAIRS:
            a, b = result["runs"][off], result["runs"][on]
            if a["state"] != "measured" or b["state"] != "measured":
                result["pairs"].append({"off": off, "on": on, "increases": None, "met": None})
                continue
            if pair_check is not None:
                try:
                    pair_check(a, b)
                except (ValueError, KeyError, TypeError, IndexError, OverflowError) as exc:
                    reason = "pair " + str(off) + "/" + str(on) + ": " + str(exc)
                    missing.append(reason)
                    result["pairs"].append({"off": off, "on": on, "increases": None, "met": None, "reason": reason})
                    continue
            increases = {key: b["resources"][key] - a["resources"][key] for key, _ in LIMITS}
            result["pairs"].append({"off": off, "on": on, "increases": increases,
                                    "met": all(increases[key] <= maximum for key, maximum in LIMITS)})
        if missing:
            result["unavailable_reason"] = "; ".join(missing)
        else:
            result["observer_screen"] = "met" if all(p["met"] for p in result["pairs"]) and all(v["met"] for r in result["runs"] for v in r["viewers"]) else "not_met"
    except (ValueError, KeyError, TypeError, IndexError, OverflowError) as exc:
        result["unavailable_reason"] = str(exc)
    return result


def assess(runs):
    return assess_cohort(runs, method=METHOD, order=ORDER, evaluate=evaluate_run)


def cohort_main(assessor, *, screen_key="observer_screen"):
    if len(sys.argv) != 2:
        return 2
    try:
        with open(sys.argv[1], "rb") as source:
            body = source.read(16 * 1024**2 + 1)
        if len(body) > 16 * 1024**2:
            raise ValueError("cohort size bound")
        result = assessor(json.loads(body, object_pairs_hook=strict_object))
    except (OSError, ValueError, TypeError):
        return 1
    print(json.dumps(result, allow_nan=False, indent=2))
    return 0 if result[screen_key] == "met" else 1


def main():
    return cohort_main(assess)


if __name__ == "__main__":
    raise SystemExit(main())
