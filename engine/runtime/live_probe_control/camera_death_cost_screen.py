"""Supplied whole-camera-death observations and bounded cost consistency only."""

from .contracts import digest, integer
from .container_cost_screen import interval_cost
from .fault_cost_screen import browser_cost
from .game_failure_screen import one
from .observer_screen import acquisition_context, cohort_main
from .probe_transport import hash_value, request_value

METHOD = "n10-contained-camera-death-cost-v1"
MODE = "engineering-game-camera-death-cost"


def require(value, reason):
    if not value:
        raise ValueError(reason)


def assess(runs):
    result = dict(
        method=METHOD,
        cost_screen="unavailable",
        live_authority=False,
        qualification="unavailable_camera_death_engineering_only",
        cost_limits="not_evaluated",
        lifetime_comparison="supplied_process_and_journal_consistency_only",
        browser_cleanup="explicit_fixture_cleanup_not_automatic_desktop_acceptance",
        excluded_cost_scopes=[
            "initial_source_startup",
            "later_relay_monitor_interpreter_container_browser_exit",
            "individual_ancillary_breakdown",
            "browser_cleanup_exit_rss_gpu",
        ],
    )
    try:
        require(
            type(runs) is list and len(runs) == 1,
            "one original whole-camera acquisition required",
        )
        run = runs[0]
        require(
            run["status"] == "passed"
            and run["method"] == METHOD
            and run["mode"] == MODE
            and run["role"] == "contained_camera_death_cost_not_qualification"
            and run["case"] == "camera-death"
            and run["live_authority"] is False,
            "original camera-death scope required",
        )
        acquisition_context(run)
        events = run["events"]
        ready = one(events, "camera_ready")
        require(
            ready["source"] == "isolated_game" and ready["mode"] == MODE,
            "owned game required",
        )
        dispatch, fault, armed, pinned, exited, verified, complete = [
            one(events, kind)
            for kind in (
                "game_failure_dispatched",
                "game_failure_fault",
                "camera_death_armed",
                "camera_death_pinned",
                "camera_process_exit",
                "camera_death_verified",
                "complete",
            )
        ]
        request = dispatch["request"]
        request_value(request)
        require(
            request["target_fps"] == 24
            and request["duration_ns"] == 2000000000
            and dispatch["live_authority"] is False
            and fault["target_observed"] is True,
            "bounded target observation required",
        )
        for event in (dispatch, fault, armed, pinned, verified, complete):
            require(event["method"] == METHOD, "camera-death method substitution")
        for event in (armed, pinned, verified, complete):
            require(event["live_authority"] is False, "false authority required")
        require(
            exited["code"] is None and exited["signal"] == "SIGKILL",
            "exact direct camera was not reaped after abrupt kill",
        )
        identities = pinned["identities"]
        require(
            set(identities) == {"camera", "first", "second", "game", "display", "pulse"}
            and len(set(identities.values())) == 6,
            "distinct process pin inventory required",
        )
        for value in identities.values():
            hash_value(value)
        require(
            set(pinned["workers"]) == {"first", "second"}, "two native workers required"
        )
        for name, native in pinned["workers"].items():
            fps = 24 if name == "first" else 30
            expected = dict(
                configured_fps=fps,
                negotiated_fps=fps,
                width=640,
                height=480,
                target_bitrate=1500000,
                cpu_used=6,
                max_quantizer=48,
            )
            require(
                all(
                    type(native[k]) is int and native[k] == v
                    for k, v in expected.items()
                ),
                "worker profile/target mismatch",
            )
            integer(native["encoded_buffers"], 1, 2**53 - 1)
        before, after = pinned["journal"], verified["journal"]
        for journal in (before, after):
            projection = journal["projection"]
            require(
                digest(projection) == journal["projection_hash"],
                "journal projection hash mismatch",
            )
            for key in ("projection_hash", "private_content_hash", "directory_hash"):
                hash_value(journal[key])
            require(
                projection["state"] == "active"
                and projection["active"] == request["request_id"]
                and type(projection["actions"]) is int
                and projection["actions"] == 1
                and type(projection["reserved_ns"]) is int
                and projection["reserved_ns"] == 4000000000
                and len(projection["history"]) == 1,
                "unresolved full reservation required",
            )
            row = projection["history"][0]
            require(
                row["request"] == request
                and row["request_hash"] == digest(request)
                and row["process_hash"] == identities["first"]
                and row["result"] is None
                and row["failure"] is None,
                "unresolved worker request binding mismatch",
            )
        require(before == after, "camera death cleared or changed durable journal")
        for key in (
            "workers_exit_observed",
            "worker_lifetimes_absent",
            "source_alive_before_cleanup",
            "source_cleanup",
            "restart_dispatch_blocked",
        ):
            require(
                verified[key] is True,
                "missing camera-death/cleanup observation: " + key,
            )
        require(
            type(verified["residual_descendants"]) is int
            and verified["residual_descendants"] == 0
            and verified["controller_result"] is None
            and verified["restoration"] == "unavailable_camera_died"
            and complete["whole_camera_cleanup"] is True,
            "cleanup or unknown-result state changed",
        )
        initial = [e for e in events if e["kind"] == "fault_cost_checkpoint"]
        external = [e for e in events if e["kind"] == "camera_death_cost_checkpoint"]
        require(
            tuple(e["phase"] for e in initial) == ("before_dispatch", "fault_injected")
            and tuple(e["phase"] for e in external)
            == ("before_camera_kill", "workers_exited", "cleanup_finished"),
            "original cost checkpoints required",
        )
        points = initial + external
        require(
            all(e["method"] == METHOD and e["live_authority"] is False for e in points),
            "cost checkpoint scope mismatch",
        )
        order = [
            initial[0],
            dispatch,
            fault,
            initial[1],
            armed,
            pinned,
            external[0],
            exited,
            external[1],
            external[2],
            verified,
            complete,
        ]
        require(
            [events.index(e) for e in order] == sorted(events.index(e) for e in order),
            "cost checkpoint chronology mismatch",
        )
        stages = [
            dict(
                start=a["phase"],
                end=b["phase"],
                **interval_cost(a["sample"], b["sample"]),
            )
            for a, b in zip(points, points[1:])
        ]
        result.update(
            cost_screen="met",
            restoration="unavailable_camera_died",
            journal_state="active",
            container_intervals=stages,
            container_before_dispatch_through_cleanup=interval_cost(
                points[0]["sample"], points[-1]["sample"]
            ),
            **browser_cost(run),
        )
    except (ValueError, KeyError, TypeError, IndexError, OverflowError) as error:
        result["unavailable_reason"] = str(error)
    return result


def main():
    return cohort_main(assess, screen_key="cost_screen")


if __name__ == "__main__":
    raise SystemExit(main())
