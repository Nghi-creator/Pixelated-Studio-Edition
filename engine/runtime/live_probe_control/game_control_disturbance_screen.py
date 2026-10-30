"""Contained owned-game engineering screen; no perceptual or production authority."""

from .control_disturbance_screen import screen_main, summarize_control
from .observer_screen import delta
from .probe_transport import hash_value

METHOD = "n10-contained-game-control-disturbance-v1"


def summarize(run):
    result = summarize_control(run, method=METHOD, role="contained_game_control_disturbance_not_qualification",
                               mode="engineering-game-disturbance", source="isolated_game",
                               qualification="unavailable_contained_game_engineering_only")
    if result["control_screen"] == "unavailable":
        return result
    try:
        bound = [e for e in run["events"] if e["kind"] == "control_capture_bound"]
        if len(bound) != 1 or bound[0]["method"] != METHOD or bound[0]["scope"] != "owned_x99_game_display" or bound[0]["live_authority"] is not False:
            raise ValueError("one exact contained capture binding required")
        hash_value(bound[0]["binding_hash"])
        for event in run["events"]:
            if event["kind"] != "control_native":
                continue
            phases = [s["game_phase"] for s in event["samples"]]
            if delta(phases, "game_age_ns") <= 0 or delta(phases, "script_age_ns") <= 0 or delta(phases, "script_actions") <= 0:
                raise ValueError("owned game/script progression unavailable")
        result["capture_binding_hash"] = bound[0]["binding_hash"]
        result["real_game_quality"] = "temporal_proxies_only_perceptual_not_evaluated"
    except (ValueError, KeyError, TypeError, IndexError, OverflowError) as exc:
        result["control_screen"] = "unavailable"
        result["unavailable_reason"] = str(exc)
    return result


def main():
    return screen_main(summarize)


if __name__ == "__main__":
    raise SystemExit(main())
