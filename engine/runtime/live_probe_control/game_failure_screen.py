"""Fixed contained-game lifecycle cohort; expected uncertainty is never restoration proof."""

from .game_control_disturbance_screen import summarize as control_summary
from .observer_screen import acquisition_context, browser_screen, cohort_main
from .probe_transport import hash_value, request_value

METHOD = "n10-contained-game-failure-v1"
ORDER = ("engineering-game-disturbance", "engineering-game-cancel", "engineering-game-receiver-loss",
         "engineering-game-source-loss", "engineering-game-reconnect")
CASES = ("cancel", "receiver-loss", "source-loss", "reconnect")


def one(events, kind):
    values = [e for e in events if e["kind"] == kind]
    if len(values) != 1:
        raise ValueError("one " + kind + " event required")
    return values[0]


def failure_summary(run, case):
    if run.get("status") != "passed" or run["live_authority"] is not False or run["method"] != METHOD or run["case"] != case or run["role"] != "contained_game_failure_not_qualification":
        raise ValueError("complete declared failure acquisition required")
    events = run["events"]
    ready, complete = one(events, "camera_ready"), one(events, "complete")
    if ready["source"] != "isolated_game" or ready["mode"] != run["mode"] or complete["worker_cleanup"] is not True or complete["game_alive"] is not True:
        raise ValueError("game source/cleanup proof missing")
    capture = one(events, "control_capture_bound")
    if capture["method"] != METHOD or capture["scope"] != "owned_x99_game_display" or capture["live_authority"] is not False:
        raise ValueError("exact contained capture scope missing")
    hash_value(capture["binding_hash"])
    dispatched, fault, result, verified = (one(events, kind) for kind in (
        "game_failure_dispatched", "game_failure_fault", "game_failure_result", "game_failure_verified"))
    if any(e["method"] != METHOD or e["case"] != case for e in (dispatched, fault, result, verified)):
        raise ValueError("failure event scope mismatch")
    if not events.index(dispatched) < events.index(fault) < events.index(result) < events.index(verified) or fault["target_observed"] is not True:
        raise ValueError("fault was not within an observed action")
    request = dispatched["request"]
    request_value(request)
    if request["target_fps"] != 24 or request["duration_ns"] != 2000000000 or dispatched["live_authority"] is not False:
        raise ValueError("one bounded failure request required")
    clean = case == "cancel"
    expected = "clean" if clean else "dirty"
    for row in (result, verified):
        if row["ledger_state"] != expected or type(row["actions"]) is not int or row["actions"] != 1 or type(row["reserved_ns"]) is not int or row["reserved_ns"] != 4000000000:
            raise ValueError("failure reservation/state reset")
    body = result["result"]
    if clean:
        if body["live_authority"] is not False or body != {"request_id": request["request_id"], "outcome": "aborted", "restoration": "verified_by_port", "reason": "cancelled", "live_authority": False}:
            raise ValueError("cancel needs verified restoration")
    elif body is not None:
        if body["request_id"] != request["request_id"] or body["restoration"] != "unknown" or body["live_authority"] is not False or body["outcome"] == "completed":
            raise ValueError("fault fabricated restoration/completion")
    elif case == "source-loss":
        raise ValueError("source-loss result not observed")
    for key in ("old_reaped", "stale_handles_rejected", "owner_restarted", "old_owner_rejected", "game_progress", "sibling_progress", "sibling_identity_retained"):
        if verified[key] is not True:
            raise ValueError("replacement/restart/isolation proof missing")
    if verified["live_authority"] is not False or verified["dirty_blocked"] is not (not clean) or verified["clean_draft_allowed"] is not clean:
        raise ValueError("restarted owner authority mismatch")
    if type(verified["old_exit"]) is not int or verified["old_exit"] != (0 if clean else -9):
        raise ValueError("old worker exit proof mismatch")
    if case == "source-loss":
        restored = one(events, "game_failure_source_restored")
        if restored["method"] != METHOD or not events.index(fault) < events.index(restored) < events.index(verified) or verified["source_restored"] is not True:
            raise ValueError("source restoration missing")
    elif verified["source_restored"] is not False:
        raise ValueError("unrelated source restoration claim")
    if clean or case == "reconnect":
        reconnect = one(events, "game_failure_reconnect")
        if reconnect["case"] != case:
            raise ValueError("reconnect scope mismatch")
    viewers = run["viewers"]
    failures = 1 if case in ("receiver-loss", "source-loss") else 0
    if len(viewers) != 2 or viewers[0]["failures"] != failures or viewers[1]["failures"] != 0 or viewers[0]["bindings"] != 3 or viewers[1]["bindings"] != 2 or any(v["unbound"] < 1 for v in viewers):
        raise ValueError("viewer replacement/rebound mismatch")
    quality = browser_screen(run["sibling_quality"], measurement_ms=2000)
    return {"case": case, "state": "measured", "sibling": quality, "old_exit": verified["old_exit"],
            "restoration": body["restoration"] if body is not None else "unavailable_no_result", "ledger_state": expected}


def assess(runs):
    result = {"method": METHOD, "live_authority": False, "qualification": "unavailable_contained_game_engineering_only",
              "perceptual_quality": "not_evaluated", "failure_screen": "unavailable", "cases": []}
    try:
        if type(runs) is not list or len(runs) != len(ORDER) or tuple(r["mode"] for r in runs) != ORDER:
            raise ValueError("complete fixed game failure order required")
        identity, missing, met = None, [], True
        for index, run in enumerate(runs):
            try:
                if run.get("status") != "passed":
                    raise ValueError("incomplete acquisition")
                key = acquisition_context(run)
                if identity is not None and key != identity:
                    raise ValueError("cohort image/software/browser context changed")
                identity = key
                if index == 0:
                    row = control_summary(run)
                    if row["control_screen"] == "unavailable":
                        raise ValueError(row.get("unavailable_reason", "control unavailable"))
                    met = met and row["control_screen"] == "met"
                    result["cases"].append({"case": "complete", "state": "measured", "screen": row["control_screen"]})
                else:
                    row = failure_summary(run, CASES[index - 1])
                    met = met and row["sibling"]["met"]
                    result["cases"].append(row)
            except (ValueError, KeyError, TypeError, IndexError, OverflowError) as exc:
                missing.append(str(index) + ": " + str(exc))
                result["cases"].append({"case": "complete" if index == 0 else CASES[index - 1], "state": "unavailable", "reason": str(exc)})
        if missing:
            result["unavailable_reason"] = "; ".join(missing)
        else:
            result["failure_screen"] = "met" if met else "not_met"
    except (ValueError, KeyError, TypeError, IndexError, OverflowError) as exc:
        result["unavailable_reason"] = str(exc)
    return result


def main():
    return cohort_main(assess, screen_key="failure_screen")

if __name__ == "__main__":
    raise SystemExit(main())
