"""Owned-game blocked-control-thread observations; no qualified cost policy."""

from .fault_cost_screen import summarize as cost_summary
from .observer_screen import cohort_main
from .thread_exit_cost_screen import _thread_lifecycle

METHOD = "n10-contained-controller-thread-block-cost-v1"
MODE = "engineering-game-controller-thread-block-cost"
CASE = "controller-thread-block"


def lifecycle_summary(run):
    return _thread_lifecycle(
        run,
        method=METHOD,
        mode=MODE,
        case=CASE,
        event="controller_thread_block_observed",
        alive=True,
        minimum_ns=100000000,
        minimum_buffers=3,
    )


def summarize(run):
    return cost_summary(run, _interruption=CASE)


def assess(runs):
    if type(runs) is not list or len(runs) != 1:
        return dict(
            method=METHOD,
            cost_screen="unavailable",
            live_authority=False,
            reason="one original controller-thread-block acquisition required",
        )
    return summarize(runs[0])


def main():
    return cohort_main(assess, screen_key="cost_screen")


if __name__ == "__main__":
    raise SystemExit(main())
