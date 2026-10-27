"""Integrated synthetic controller temporal screen, never game/perceptual qualification."""

import itertools

from .browser_game_worker import strict_object
from .observer_screen import (
    acquisition_context,
    browser_screen,
    delta,
    increasing,
    number,
    resources,
)
from .peer_protocol import PROFILE_ENCODERS
from .probe_transport import hash_value

METHOD = "n10-integrated-control-disturbance-v1"
PHASES = ("baseline", "during", "restored")


def continuity_screen(data):
    if data["basis"] != "browser_performance_relative_ms" or data["failure"] is not None:
        raise ValueError("continuous browser trace unavailable")
    duration, frames = number(data["duration_ms"]), data["frames"]
    if not 10000 <= duration <= 26000 or not 200 <= len(frames) <= 2048:
        raise ValueError("continuous trace bounds")
    times = [number(f["at_ms"]) for f in frames]
    pts = [number(f["pts_ms"]) for f in frames]
    counts = [number(f["presented"]) for f in frames]
    if any(type(c) is not int for c in counts) or times[-1] > duration:
        raise ValueError("continuous counter/window mismatch")
    return {"met": increasing(times, 250) and increasing(pts, 250) and increasing(counts, 8)
            and times[0] <= 250 and duration - times[-1] <= 500
            and all(f["width"] == 640 and f["height"] == 480 for f in frames),
            "maximum_presentation_gap_ms": max(b - a for a, b in itertools.pairwise(times)),
            "maximum_pts_gap_ms": max(b - a for a, b in itertools.pairwise(pts))}


def summarize(run):
    result = {"method": METHOD, "live_authority": False, "qualification": "unavailable_integrated_synthetic_only",
              "perceptual_quality": "not_evaluated", "real_game_quality": "not_evaluated", "control_screen": "unavailable"}
    try:
        if run.get("status") != "passed":
            raise ValueError("incomplete control acquisition")
        if run["method"] != METHOD or run["role"] != "integrated_synthetic_control_disturbance_not_qualification" or run["mode"] != "engineering-disturbance" or run["status"] != "passed" or run["live_authority"] is not False:
            raise ValueError("complete integrated synthetic acquisition required")
        acquisition_context(run)
        events = run["events"]
        ready = [e for e in events if e["kind"] == "camera_ready"]
        complete = [e for e in events if e["kind"] == "complete"]
        if len(ready) != 1 or ready[0]["source"] != "isolated_synthetic" or ready[0]["mode"] != run["mode"] or len(complete) != 1 or complete[0]["worker_cleanup"] is not True or complete[0]["game_alive"] is not True:
            raise ValueError("synthetic source/cleanup proof missing")
        if len(run["viewers"]) != 2 or any(v["failures"] != 0 or v["unbound"] != 1 for v in run["viewers"]):
            raise ValueError("viewer failure/lifecycle mismatch")
        windows = run["control_windows"]
        native = [e for e in events if e["kind"] == "control_native"]
        started = [e for e in events if e["kind"] == "control_window_started"]
        if any(tuple(e["phase"] for e in values) != PHASES for values in (windows, native, started)):
            raise ValueError("ordered baseline/during/restored windows required")
        dispatched = [e for e in events if e["kind"] == "control_dispatched"]
        outcomes = [e for e in events if e["kind"] == "control_result"]
        if len(dispatched) != 1 or dispatched[0]["request"]["target_fps"] != 24 or dispatched[0]["request"]["duration_ns"] != 5000000000 or dispatched[0]["live_authority"] is not False or len(outcomes) != 1:
            raise ValueError("one bounded 24 FPS request required")
        if any(e["method"] != METHOD for e in (*native, *started, *dispatched, *outcomes)):
            raise ValueError("control event method mismatch")
        outcome = outcomes[0]
        body = outcome["result"]
        if body != {"request_id": dispatched[0]["request"]["request_id"], "outcome": "completed", "restoration": "verified_by_port", "reason": "duration_elapsed", "live_authority": False} or outcome["ledger_state"] != "clean" or type(outcome["actions"]) is not int or outcome["actions"] != 1 or type(outcome["reserved_ns"]) is not int or outcome["reserved_ns"] != 7000000000 or body["live_authority"] is not False:
            raise ValueError("verified restoration/retained budget required")
        flow = [e["kind"] + ":" + e.get("phase", "") for e in events if e["kind"] in (
            "control_window_started", "control_native", "control_dispatched", "control_result")]
        if flow != ["control_window_started:baseline", "control_native:baseline", "control_dispatched:",
                    "control_window_started:during", "control_native:during", "control_result:",
                    "control_window_started:restored", "control_native:restored"]:
            raise ValueError("action/window chronology mismatch")
        identities = native[0]["worker_identities"]
        if set(identities) != {"first", "second"} or any(type(v) is not str or len(v) != 64 for v in identities.values()):
            raise ValueError("exact worker identities missing")
        for value in identities.values():
            hash_value(value)
        rows, boundary = [], None
        cpu, quantizer = PROFILE_ENCODERS["balanced"]
        for window, report in zip(windows, native, strict=True):
            if report["method"] != METHOD or report["worker_identities"] != identities or len(window["quality"]) != 2:
                raise ValueError("worker/offer/measurement identity changed")
            samples = report["samples"]
            if boundary is not None and samples[0]["read_start_ns"] <= boundary:
                raise ValueError("native phase clock overlapped/reversed")
            boundary = samples[-1]["read_end_ns"]
            for sample in samples:
                for peer in ("first", "second"):
                    fps = 24 if window["phase"] == "during" and peer == "first" else 30
                    if any(type(v) is not int for v in sample["workers"][peer]["settings"].values()) or sample["workers"][peer]["settings"] != {"configured_fps": fps, "negotiated_fps": fps,
                            "width": 640, "height": 480, "target_bitrate": 1500000, "cpu_used": cpu, "max_quantizer": quantizer}:
                        raise ValueError("unexpected native FPS/caps/encoder setting")
            row = {"phase": window["phase"], "viewers": [browser_screen(q, measurement_ms=2000,
                expected_fps=24 if window["phase"] == "during" and i == 0 else 30) for i, q in enumerate(window["quality"])],
                "resources": resources({"events": [{**report, "kind": "screen_native"}],
                    "browser_resources": window["browser_resources"]}, duration_ns=2500000000)}
            rows.append(row)
        if len(run["continuity"]) != 2:
            raise ValueError("two continuous presentation traces required")
        traces = [continuity_screen(trace) for trace in run["continuity"]]
        # Cumulative stats span the gaps between measurement windows too.
        for viewer in (0, 1):
            stats = [s for window in windows for s in window["quality"][viewer]["stats"]]
            counts = [f["presented"] for f in run["continuity"][viewer]["frames"]]
            if any(not counts[0] <= f["presented"] <= counts[-1] for window in windows for f in window["quality"][viewer]["frames"]):
                raise ValueError("continuous trace does not cover phase frame counters")
            if delta(stats, "dropped") != 0 or delta(stats, "freezes") != 0:
                raise ValueError("drops/freezes across action transitions")
            delta(stats, "decoded")
        result.update(windows=rows, continuity=traces,
                      control_screen="met" if all(t["met"] for t in traces) and all(v["met"] for row in rows for v in row["viewers"]) else "not_met")
    except (ValueError, KeyError, TypeError, IndexError, OverflowError) as exc:
        result["unavailable_reason"] = str(exc)
    return result


def main():
    import json
    import sys

    if len(sys.argv) != 2:
        return 2
    try:
        with open(sys.argv[1], "rb") as source:
            body = source.read(16 * 1024**2 + 1)
        if len(body) > 16 * 1024**2:
            raise ValueError("control receipt size bound")
        result = summarize(json.loads(body, object_pairs_hook=strict_object))
    except (OSError, ValueError, TypeError):
        return 1
    print(json.dumps(result, allow_nan=False, indent=2))
    return 0 if result["control_screen"] == "met" else 1


if __name__ == "__main__":
    raise SystemExit(main())
