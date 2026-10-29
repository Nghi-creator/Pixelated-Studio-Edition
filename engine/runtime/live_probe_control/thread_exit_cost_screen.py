"""Thread-only exit and streaming observations, with separate owned-game cost scope."""

from .contracts import integer
from .fault_cost_screen import summarize as cost_summary
from .game_failure_screen import one
from .observer_screen import cohort_main
from .stalled_worker_cost_screen import _interrupted_lifecycle, require

METHOD = "n10-contained-controller-thread-exit-cost-v1"
MODE = "engineering-game-controller-thread-exit-cost"
CASE = "controller-thread-exit"


def lifecycle_summary(run):
    summary = _interrupted_lifecycle(run, method=METHOD, mode=MODE, case=CASE)
    events = run["events"]
    observation = one(events, "controller_thread_exit_observed")
    dispatched = one(events, "game_failure_dispatched")
    require(
        observation["method"] == METHOD
        and observation["request"] == dispatched["request"]
        and observation["live_authority"] is False
        and observation["control_thread_alive"] is False
        and type(observation["configured_fps"]) is int
        and type(observation["negotiated_fps"]) is int
        and observation["configured_fps"] == observation["negotiated_fps"] == 24,
        "thread-only observation context mismatch",
    )
    for key in ("injected_at_ns", "observed_at_ns", "before_buffers", "after_buffers"):
        integer(observation[key], 1, 2**63 - 1)
    require(
        observation["observed_at_ns"] > observation["injected_at_ns"]
        and observation["after_buffers"] > observation["before_buffers"]
        and events.index(one(events, "game_failure_fault"))
        < events.index(observation)
        < events.index(one(events, "game_failure_result")),
        "post-thread-exit media progress absent or misordered",
    )
    summary["controller_thread"] = "exit_observed_media_progressed_without_result"
    return summary


def summarize(run):
    return cost_summary(run, _thread=True)


def assess(runs):
    if type(runs) is not list or len(runs) != 1:
        return dict(
            method=METHOD,
            cost_screen="unavailable",
            live_authority=False,
            reason="one original controller-thread-exit acquisition required",
        )
    return summarize(runs[0])


def main():
    return cohort_main(assess, screen_key="cost_screen")


if __name__ == "__main__":
    raise SystemExit(main())
