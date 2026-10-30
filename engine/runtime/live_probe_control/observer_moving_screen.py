"""Separate fixed moving-workload cohort; phase matching never proves pixel equivalence."""

from .observer_screen import (
    assess_cohort,
    cohort_main,
    evaluate_run,
    increasing,
    number,
)

METHOD = "n10-observer-moving-disturbance-v2"
ACQUISITION = "n10-observer-moving-acquisition-v2"
ORDER = tuple("observer-moving-" + condition for condition in ("off", "on", "on", "off", "off", "on"))
PHASE_TOLERANCE = 150000000


def integer(value):
    number(value)
    if type(value) is not int:
        raise ValueError("integral phase counter required")
    return value


def script_phase(value, *, eligibility=False):
    game, age, actions = (integer(value[k]) for k in ("game_age_ns", "script_age_ns", "script_actions"))
    if game < 3000000000 or game < age:
        raise ValueError("game load/phase unavailable")
    if eligibility:
        if not 0 <= age <= 50000000 or actions != 0:
            raise ValueError("script was active before eligibility")
    elif actions < 1 or not 0 <= age - (actions - 1) * 400000000 <= 400000000 + PHASE_TOLERANCE:
        raise ValueError("script action phase/lag unavailable")
    return age


def phase_screen(run):
    reports = [e for e in run["events"] if e["kind"] == "moving_phase"]
    if len(reports) != 1:
        raise ValueError("one moving phase report required")
    report = reports[0]
    if report["method"] != ACQUISITION or report["basis"] != "camera_host_monotonic_no_browser_alignment" or report["source_content_matched"] is not False:
        raise ValueError("closed moving phase provenance required")
    phases = report["phases"]
    if len(phases) != 3 or [v["label"] for v in phases] != ["eligible", "window_start", "window_end"]:
        raise ValueError("ordered moving phase edges required")
    eligible, start, end = phases
    for event, label in (("moving_eligible", eligible), ("moving_window", start)):
        values = [e for e in run["events"] if e["kind"] == event]
        if len(values) != 1 or values[0] != {"kind": event, "method": ACQUISITION, **label}:
            raise ValueError("moving phase edge disagrees with acquisition")
    script_phase(eligible, eligibility=True)
    if integer(eligible["at_ns"]) > 8 * 10**9:
        raise ValueError("eligibility exceeded fixed deadline")
    ages = [integer(p["script_age_ns"]) for p in phases]
    stamps = [integer(p["at_ns"]) for p in phases]
    if not increasing(stamps, 6 * 10**9):
        raise ValueError("phase clock reversed")
    if not 3000000000 <= script_phase(start) <= 3000000000 + PHASE_TOLERANCE or start["script_actions"] != 8:
        raise ValueError("fixed warmup/start phase mismatch")
    if not 7500000000 <= script_phase(end) <= 8150000000:
        raise ValueError("measurement end phase mismatch")
    offsets = [p["game_age_ns"] - p["script_age_ns"] for p in phases]
    if max(offsets) - min(offsets) > 1000000 or any(abs((t - stamps[0]) - (a - ages[0])) > 1000000 for t, a in zip(stamps, ages, strict=True)):
        raise ValueError("phase clock/script origin changed")
    samples = next(e for e in run["events"] if e["kind"] == "screen_native")["samples"]
    sample_ages = [script_phase(s["game_phase"]) for s in samples]
    if not increasing(sample_ages, 500000000) or not 0 <= sample_ages[0] - ages[1] <= 50000000 or not 0 <= ages[2] - sample_ages[-1] <= 50000000:
        raise ValueError("phase sample/edge coverage mismatch")
    for sample, age in zip(samples, sample_ages, strict=True):
        phase = sample["game_phase"]
        if abs((phase["game_age_ns"] - age) - offsets[0]) > 1000000:
            raise ValueError("sample game/script origin changed")
        if abs((sample["read_start_ns"] - samples[0]["read_start_ns"]) - (age - sample_ages[0])) > 50000000:
            raise ValueError("sample phase/native clock disagrees")
    return {"start_script_age_ns": ages[1], "end_script_age_ns": ages[2],
            "start_game_age_ns": start["game_age_ns"], "end_game_age_ns": end["game_age_ns"]}


def evaluate(run, identity):
    if run.get("status") != "passed":
        raise ValueError("incomplete acquisition: " + str(run.get("failure", "missing failure detail")).split("\n", 1)[0])
    if run["mode"] not in ORDER or run["method"] != ACQUISITION or run["role"] != "moving_acquisition_not_qualification":
        raise ValueError("moving acquisition identity required")
    row, key = evaluate_run(run, identity, on_mode="observer-moving-on")
    row["phase"] = phase_screen(run)
    startup = run["startup"]
    peers = set()
    if len(startup) != 2:
        raise ValueError("two presentation traces required")
    for trace in startup:
        if trace["basis"] != "page_performance_ms_no_native_alignment" or len(trace["timelines"]) != 1:
            raise ValueError("initial browser presentation scope required")
        peer, timeline = next(iter(trace["timelines"].items()))
        if peer in peers or peer not in ("first", "second"):
            raise ValueError("duplicate/unknown browser presentation scope")
        peers.add(peer)
        connected = number(timeline["connected"]["at_ms"])
        presented = timeline["first_presented"]
        if not 0 <= number(presented["at_ms"]) - connected <= 1000 or integer(presented["presented"]) < 1:
            raise ValueError("browser startup presentation unavailable")
    return row, key


def comparable(a, b):
    if any(abs(a["phase"][edge] - b["phase"][edge]) > PHASE_TOLERANCE
           for edge in ("start_script_age_ns", "end_script_age_ns", "start_game_age_ns", "end_game_age_ns")):
        raise ValueError("paired game/script phase difference exceeds 150 ms")


def assess(runs):
    result = assess_cohort(runs, method=METHOD, order=ORDER, evaluate=evaluate, pair_check=comparable)
    result["source_content_matched"] = False
    result["causal_observer_effect"] = "not_established"
    return result


def main():
    return cohort_main(assess)


if __name__ == "__main__":
    raise SystemExit(main())
