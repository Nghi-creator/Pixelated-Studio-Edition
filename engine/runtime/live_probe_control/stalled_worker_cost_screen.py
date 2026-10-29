"""Stopped-peer interruption costs; no attribution of which independent guard won."""

from .game_failure_screen import one
from .observer_screen import browser_screen, cohort_main, number
from .probe_transport import request_value, hash_value
from .contracts import digest

METHOD = "n10-contained-stalled-worker-cost-v1"
MODE = "engineering-game-worker-stall-cost"


def require(value, message):
    if not value:
        raise ValueError(message)


def _interrupted_lifecycle(run, *, method, mode, case):
    events = run["events"]
    ready, complete = one(events, "camera_ready"), one(events, "complete")
    require(
        ready["source"] == "isolated_game"
        and ready["mode"] == mode
        and complete["worker_cleanup"] is True
        and complete["game_alive"] is True,
        "owned source/cleanup missing",
    )
    capture = one(events, "control_capture_bound")
    hash_value(capture["binding_hash"])
    require(
        capture["method"] == method
        and capture["scope"] == "owned_x99_game_display"
        and capture["live_authority"] is False,
        "capture mismatch",
    )
    dispatched, fault, result, verified = [
        one(events, k)
        for k in (
            "game_failure_dispatched",
            "game_failure_fault",
            "game_failure_result",
            "game_failure_verified",
        )
    ]
    require(
        all(
            e["method"] == method and e["case"] == case
            for e in (dispatched, fault, result, verified)
        ),
        "stalled worker event scope changed",
    )
    require(
        events.index(dispatched)
        < events.index(fault)
        < events.index(result)
        < events.index(verified)
        and fault["target_observed"] is True,
        "stopped before observed target",
    )
    request_value(dispatched["request"])
    request = dispatched["request"]
    require(
        request["target_fps"] == 24
        and request["duration_ns"] == 2000000000
        and dispatched["live_authority"] is False,
        "bounded stop request mismatch",
    )
    require(
        result["result"] is None and result["operation_status"] == "worker_lost",
        "stopped worker fabricated result",
    )
    for e in (result, verified):
        require(
            e["ledger_state"] == "active"
            and type(e["actions"]) is int
            and e["actions"] == 1
            and type(e["reserved_ns"]) is int
            and e["reserved_ns"] == 4000000000,
            "unresolved intent/reservation reset",
        )
    for key in (
        "old_reaped",
        "stale_handles_rejected",
        "owner_restarted",
        "old_owner_rejected",
        "game_progress",
        "sibling_progress",
        "sibling_identity_retained",
        "dirty_blocked",
    ):
        require(verified[key] is True, "recovery or dirty-state blocking missing")
    require(
        type(verified["old_exit"]) is int
        and verified["old_exit"] == -9
        and verified["clean_draft_allowed"] is False
        and verified["source_restored"] is False
        and verified["live_authority"] is False,
        "teardown/restoration claim mismatch",
    )
    rows = [e for e in events if e["kind"] == "failure_lifetime"]
    require(
        tuple(e["phase"] for e in rows)
        == ("active_target", "replacement_ready", "issuer_restarted"),
        "three lifetime checkpoints required",
    )
    require(
        events.index(dispatched)
        < events.index(rows[0])
        < events.index(fault)
        < events.index(result)
        < events.index(rows[1])
        < events.index(rows[2])
        < events.index(verified),
        "lifetime chronology mismatch",
    )
    require(
        [r["issuer_epoch"] for r in rows] == [1, 1, 2], "logical issuer epochs changed"
    )
    previous = -1
    for i, row in enumerate(rows):
        require(
            row["method"] == "n10-contained-game-lifetime-observations-v1"
            and row["case"] == case
            and row["live_authority"] is False
            and row["capture_hash"] == capture["binding_hash"],
            "lifetime scope changed",
        )
        start, end = number(row["read_start_ns"]), number(row["read_end_ns"])
        require(previous < start <= end, "lifetime clock reversed")
        previous = end
        projection = row["journal"]["projection"]
        require(
            digest(projection) == row["journal"]["projection_hash"]
            and projection["state"] == "active"
            and projection["actions"] == 1
            and projection["reserved_ns"] == 4000000000,
            "unresolved journal projection changed",
        )
        require(
            set(row["peers"])
            == ({"first", "second"} if i == 0 else {"replacement", "second"}),
            "peer lifetime scope changed",
        )
        for peer, data in row["peers"].items():
            hash_value(data["process"]["identity_hash"])
            native = data["native"]
            fps = 24 if i == 0 and peer == "first" else 30
            require(
                all(
                    native[k] == v
                    for k, v in dict(
                        configured_fps=fps,
                        negotiated_fps=fps,
                        width=640,
                        height=480,
                        target_bitrate=1500000,
                        cpu_used=6,
                        max_quantizer=48,
                    ).items()
                ),
                "native control/profile changed",
            )
        for name in ("camera", "game", "display"):
            identity = row["processes"][name]["identity_hash"]
            hash_value(identity)
            require(
                identity == rows[0]["processes"][name]["identity_hash"],
                "owned source/camera lifetime replaced",
            )
            if i:
                require(
                    row["processes"][name]["cpu_ticks"]
                    >= rows[i - 1]["processes"][name]["cpu_ticks"],
                    "process CPU counter reset",
                )
    old = rows[0]["peers"]["first"]["process"]["identity_hash"]
    sibling = rows[0]["peers"]["second"]["process"]["identity_hash"]
    require(
        rows[0]["peers"]["first"]["generation"] == request["generation"],
        "request generation not bound",
    )
    for i in (1, 2):
        row = rows[i]
        prior = rows[i - 1]
        require(
            row["old_process"]
            == dict(identity_hash=old, returncode=-9, supervisor_exit_code=-9),
            "retired exact child not reaped",
        )
        require(
            row["peers"]["replacement"]["process"]["identity_hash"] != old
            and row["peers"]["second"]["process"]["identity_hash"] == sibling,
            "worker replacement/isolation mismatch",
        )
        require(
            row["peers"]["second"]["native"]["encoded_buffers"]
            > prior["peers"]["second"]["native"]["encoded_buffers"],
            "sibling source did not advance",
        )
        require(
            all(
                row["peers"]["second"][key] == rows[0]["peers"]["second"][key]
                for key in ("generation", "token_hash", "offer_hash")
            ),
            "sibling binding changed",
        )
        require(
            row["journal"]["directory_hash"] == rows[0]["journal"]["directory_hash"],
            "journal directory replaced",
        )
    require(
        all(
            rows[1]["peers"]["replacement"][key] == rows[2]["peers"]["replacement"][key]
            for key in ("generation", "token_hash", "offer_hash")
        ),
        "replacement binding changed across issuer restart",
    )
    require(
        rows[1]["peers"]["replacement"]["process"]["identity_hash"]
        == rows[2]["peers"]["replacement"]["process"]["identity_hash"]
        and rows[1]["journal"]["projection_hash"]
        == rows[2]["journal"]["projection_hash"]
        and rows[1]["journal"]["private_content_hash"]
        == rows[2]["journal"]["private_content_hash"],
        "replacement or journal changed on issuer restart",
    )
    viewers = run["viewers"]
    require(
        len(viewers) == 2
        and viewers[0]["failures"] == 1
        and viewers[1]["failures"] == 0
        and viewers[0]["bindings"] == 3
        and viewers[1]["bindings"] == 2
        and all(v["unbound"] >= 1 for v in viewers),
        "browser failure/replacement mismatch",
    )
    return dict(
        case=case,
        sibling=browser_screen(run["sibling_quality"], measurement_ms=2000),
        restoration="unavailable_no_result",
        ledger_state="active",
        old_exit=-9,
        teardown_cause="not_attributed_between_independent_guards_and_supervisor",
    )


def lifecycle_summary(run):
    return _interrupted_lifecycle(run, method=METHOD, mode=MODE, case="worker-stall")


def summarize(run):
    from .fault_cost_screen import summarize as cost_summary

    return cost_summary(run, _interruption="worker-stall")


def assess(runs):
    if type(runs) is not list or len(runs) != 1:
        return dict(
            cost_screen="unavailable",
            method=METHOD,
            live_authority=False,
            reason="one original stalled-worker acquisition required",
        )
    return summarize(runs[0])


def main():
    return cohort_main(assess, screen_key="cost_screen")


if __name__ == "__main__":
    raise SystemExit(main())
