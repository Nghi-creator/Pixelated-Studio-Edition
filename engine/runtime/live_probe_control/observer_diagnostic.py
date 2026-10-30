"""Descriptive static-scene contrasts, deliberately separate from qualification screens."""

import json
import re
import sys

from .browser_game_worker import strict_object
from .observer_screen import acquisition_context, browser_screen, number, resources


def summarize(run):
    result = {"method": "n10-observer-static-diagnostic-v1", "diagnostic_state": "unavailable",
              "qualification": "unavailable_exploratory_static_scene", "live_authority": False,
              "perceptual_quality": "not_evaluated", "windows": [], "contrasts": None}
    try:
        if run["mode"] != "observer-static-diagnostic" or run["status"] != "passed" or run["live_authority"] is not False or run["role"] != "exploratory_static_scene_not_qualification":
            raise ValueError("explicit completed static-scene diagnostic required")
        acquisition_context(run)
        ready = [e for e in run["events"] if e["kind"] == "camera_ready"]
        complete = [e for e in run["events"] if e["kind"] == "complete"]
        if len(ready) != 1 or ready[0]["source"] != "production" or ready[0]["mode"] != run["mode"] or len(complete) != 1 or complete[0]["worker_cleanup"] is not True or complete[0]["game_alive"] is not True:
            raise ValueError("diagnostic source/cleanup unavailable")
        native = [e for e in run["events"] if e["kind"] == "diagnostic_native"]
        browser = run["diagnostic_windows"]
        labels = ["on-1", "off", "on-2"]
        if [e["phase"] for e in native] != labels or [e["phase"] for e in browser] != labels:
            raise ValueError("complete diagnostic order required")
        identities = native[0]["worker_identities"]
        commands = native[0]["private_sequences"]
        if set(identities) != {"first", "second"} or set(commands) != {"first", "second"}:
            raise ValueError("two exact worker identities required")
        if any(not re.fullmatch(r"[a-f0-9]{64}", value) for value in identities.values()) or any(type(value) is not int or not 2 <= value <= 256 for value in commands.values()):
            raise ValueError("invalid worker/command identity")
        for a, b in zip(native, browser, strict=True):
            if a["game_frozen"] is not True or a["worker_identities"] != identities or a["private_sequences"] != commands:
                raise ValueError("worker/source/private-command context changed")
            if any(sample["game"]["cpu_ticks"] != a["samples"][0]["game"]["cpu_ticks"] for sample in a["samples"]):
                raise ValueError("frozen game progressed")
            if len(b["quality"]) != 2:
                raise ValueError("two receiver windows required")
            screens = [browser_screen(q, require_visual_variation=False) for q in b["quality"]]
            if not all(screen["met"] for screen in screens):
                raise ValueError("diagnostic receiver temporal/nonblank failure")
            row = resources({"events": [{**a, "kind": "screen_native"}], "browser_resources": b["browser_resources"]}, require_game_progress=False)
            result["windows"].append({"phase": a["phase"], "resources": row, "viewers": screens})
        baseline = result["windows"][1]["resources"]
        result["contrasts"] = {result["windows"][i]["phase"] + "_minus_off": {key: value - baseline[key] for key, value in result["windows"][i]["resources"].items()} for i in (0, 2)}
        startup = run["startup"]
        if len(startup) != 2:
            raise ValueError("two browser startup traces required")
        observed = set()
        for page in startup:
            if page["basis"] != "page_performance_ms_no_native_alignment" or len(page["timelines"]) != 1:
                raise ValueError("browser startup clock/peer scope unavailable")
            peer, marks = next(iter(page["timelines"].items()))
            if peer not in ("first", "second") or peer in observed:
                raise ValueError("browser startup peer duplicated/unknown")
            observed.add(peer)
            for name in ("created", "local_offer", "remote_answer", "connected", "video_track", "first_presented", "first_report"):
                if number(marks[name]["at_ms"]) < marks["created"]["at_ms"]:
                    raise ValueError("browser startup clock reversed")
        result["startup"] = startup
        traces = [e for e in run["events"] if e["kind"] == "diagnostic_trace"]
        if len(traces) != 1:
            raise ValueError("native startup trace missing")
        trace = traces[0]
        if trace["basis"] != "camera_host_detection_monotonic_relative_ns_no_browser_alignment":
            raise ValueError("native startup clock unavailable")
        marks = trace["marks"]
        for name in ("eligible", "game_frozen", *(peer + suffix for peer in ("first", "second") for suffix in ("_native_connected", "_bound", "_first_report", "_ready"))):
            number(marks[name]["at_ns"])
        if marks["game_frozen"]["at_ns"] - marks["eligible"]["at_ns"] < 3 * 10**9:
            raise ValueError("fixed diagnostic warmup missing")
        result["native_startup"] = trace
        result["context"] = run["context"]
        result["diagnostic_state"] = "observed"
    except (ValueError, TypeError, KeyError, IndexError, OverflowError) as exc:
        result["unavailable_reason"] = str(exc)
    return result


def main():
    if len(sys.argv) != 2:
        return 2
    try:
        with open(sys.argv[1], "rb") as source:
            body = source.read(4 * 1024**2 + 1)
        if len(body) > 4 * 1024**2:
            raise ValueError("diagnostic size bound")
        result = summarize(json.loads(body, object_pairs_hook=strict_object))
    except (OSError, ValueError, TypeError):
        return 1
    print(json.dumps(result, indent=2, allow_nan=False))
    return 0 if result["diagnostic_state"] == "observed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
