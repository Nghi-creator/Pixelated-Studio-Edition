"""Planning v2 includes separate thread and camera fault costs, never live authority."""

from . import qualification_protocol as v1

METHOD = "n10-qualification-protocol-draft-v2"
FAULT_PROCEDURES = {
    "controller_thread_exit": "n10-contained-controller-thread-exit-cost-v1",
    "controller_thread_block": "n10-contained-controller-thread-block-cost-v1",
    "whole_camera_death": "n10-contained-camera-death-cost-v1",
}
COST_INTERVALS = {
    "controller_thread_exit": "before_dispatch_through_cleanup_callbacks",
    "controller_thread_block": "before_dispatch_through_cleanup_callbacks",
    "whole_camera_death": "before_dispatch_through_owned_descendant_cleanup",
}


def draft():
    value = v1.draft()
    value["method"] = METHOD
    value["procedures"].update(FAULT_PROCEDURES)
    for case, interval in COST_INTERVALS.items():
        value["cost_limits"]["fault_" + case + "_cpu"] = dict(
            metric="cpu_time",
            unit="second",
            comparison="absolute",
            interval=interval,
            maximum=None,
            rationale=None,
            review_reference=None,
        )
    value["fault_operation"] = dict(
        baseline_fps=30,
        target_fps=24,
        requested_duration_ns=2000000000,
        reserved_duration_ns=4000000000,
        policy=dict(value["operation"]["policy"], maximum_duration_ns=2000000000),
    )
    value["fault_scope"] = {
        name: dict(
            disposition="pending", procedure=None, rationale=None, review_reference=None
        )
        for name in FAULT_PROCEDURES
    }
    value["exclusions"][
        "later_camera_death_relay_monitor_interpreter_container_browser_exit"
    ] = dict(
        disposition="pending",
        procedure=None,
        rationale=None,
        review_reference=None,
    )
    return value


def inspect(value):
    return v1._inspect(
        value,
        draft(),
        fixed_sections=("fault_operation",),
        fault_procedures=FAULT_PROCEDURES,
    )


def main():
    return v1._main(inspect)


if __name__ == "__main__":
    raise SystemExit(main())
