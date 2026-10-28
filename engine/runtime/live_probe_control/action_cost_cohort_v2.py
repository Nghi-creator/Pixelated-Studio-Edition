"""Separate two-second dispatch-to-window schedule; v1 cohorts retain their outcomes."""

from .action_cost_cohort import assess
from .observer_screen import cohort_main


def main():
    return cohort_main(
        lambda runs: assess(runs, version="v2"), screen_key="comparison_screen"
    )


if __name__ == "__main__":
    raise SystemExit(main())
