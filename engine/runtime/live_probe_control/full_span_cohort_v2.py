"""Match container action CPU at fixed edges; keep variable cleanup costs descriptive."""

from .full_span_cohort import assess as assess_spans
from .observer_screen import cohort_main


def assess(runs):
    return assess_spans(runs, action_container=True)


def main():
    return cohort_main(assess, screen_key="comparison_screen")


if __name__ == "__main__":
    raise SystemExit(main())
