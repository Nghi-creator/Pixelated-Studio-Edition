"""Read-only qualification planning declarations; no evidence approval or execution authority."""

import json
import math
import re
import sys
from copy import deepcopy
from pathlib import Path

from .browser_game_worker import strict_object
from .contracts import Policy, digest
from .controller import GRACE_NS

METHOD = "n10-qualification-protocol-draft-v1"
# Fixed semantic slots prevent a permissive metric/unit or interval substitution.
LIMIT_SPECS = {
    "action_container_cpu": (
        "cpu_percent",
        "percentage_point",
        "action_minus_unchanged",
        "fixed_action_container",
    ),
    "action_browser_cpu": (
        "cpu_percent",
        "percentage_point",
        "action_minus_unchanged",
        "independent_browser_span",
    ),
    "action_first_worker_cpu": (
        "cpu_percent",
        "percentage_point",
        "action_minus_unchanged",
        "native_first_worker_full_span",
    ),
    "action_second_worker_cpu": (
        "cpu_percent",
        "percentage_point",
        "action_minus_unchanged",
        "native_second_worker_full_span",
    ),
    "action_first_worker_rss": (
        "sampled_peak_rss",
        "byte",
        "action_minus_unchanged",
        "native_first_worker_full_span",
    ),
    "action_second_worker_rss": (
        "sampled_peak_rss",
        "byte",
        "action_minus_unchanged",
        "native_second_worker_full_span",
    ),
    **{
        f"fault_{case}_cpu": (
            "cpu_time",
            "second",
            "absolute",
            "before_dispatch_through_cleanup_callbacks",
        )
        for case in (
            "cancel",
            "receiver_loss",
            "source_loss",
            "reconnect",
            "worker_stall",
        )
    },
}
PROCEDURES = {
    "read_only_observer": "n10-observer-moving-disturbance-v2",
    "matched_action_cost": "n10-owned-game-full-span-comparison-v2",
    "actual_fault_cost": "n10-contained-game-fault-cost-v1",
    "stopped_worker_cost": "n10-contained-stalled-worker-cost-v1",
    "native_guard_regressions": "linux_native_suite_with_peer_and_webrtc_flags",
}
EXCLUSIONS = (
    "initial_source_startup",
    "later_relay_interpreter_container_browser_exit",
    "individual_ancillary_process_breakdown",
    "browser_cleanup_exit_rss_gpu",
)
QUALITY = ("cadence", "perceptual", "audio", "desktop_workflows")
FAULT_SCOPE = ("whole_camera_death", "controller_thread_only_failure")


def draft():
    return {
        "method": METHOD,
        "role": "operator_planning_only",
        "live_authority": False,
        "context": dict(
            scope="owned_linux_game_headless_receiver",
            source="isolated_game",
            image=None,
            software_hash=None,
            browser=None,
            target_platform="linux_aarch64",
            receiver_platform="darwin_arm64",
            profile=dict(
                id="balanced",
                bitrate_bit_per_second=1500000,
                width=640,
                height=480,
                cpu_used=6,
                max_quantizer=48,
            ),
        ),
        "operation": dict(
            baseline_fps=30,
            target_fps=24,
            requested_duration_ns=5000000000,
            policy=dict(
                minimum_fps=24,
                maximum_fps=60,
                maximum_duration_ns=5000000000,
                maximum_actions=3,
                cumulative_duration_ns=12000000000,
                cooldown_ns=1000000000,
                maximum_reduction_percent=20,
                settling_ns=100000000,
            ),
        ),
        "procedures": deepcopy(PROCEDURES),
        "cost_limits": {
            name: dict(
                metric=spec[0],
                unit=spec[1],
                comparison=spec[2],
                interval=spec[3],
                maximum=None,
                rationale=None,
                review_reference=None,
            )
            for name, spec in LIMIT_SPECS.items()
        },
        "quality": {
            name: dict(procedure=None, criterion=None, review_reference=None)
            for name in QUALITY
        },
        "fault_scope": {
            name: dict(
                disposition="pending",
                procedure=None,
                rationale=None,
                review_reference=None,
            )
            for name in FAULT_SCOPE
        },
        "exclusions": {
            name: dict(
                disposition="pending",
                procedure=None,
                rationale=None,
                review_reference=None,
            )
            for name in EXCLUSIONS
        },
        "protocol_review": dict(
            revision=None, review_reference=None, independence_rationale=None
        ),
        "acquisition_rules": dict(
            prospective=True,
            exclusive_outputs=True,
            retain_all_attempts=True,
            retries=0,
            substitute_rows=False,
            average_away_failures=False,
            aligned_browser_native_clocks=False,
            historical_context_requires_applicability_review=True,
        ),
    }


def closed(value, expected, label):
    if type(value) is not dict or set(value) != set(expected):
        raise ValueError(label + ": closed fields required")


def text_or_missing(value, label, missing):
    if value is None:
        missing.append(label)
        return
    if type(value) is not str or not value.strip() or len(value.encode()) > 4096:
        raise ValueError(label + ": nonblank bounded text required")


def inspect(value):
    result = dict(
        method=METHOD,
        protocol_state="invalid",
        qualification="unavailable_protocol_is_not_evidence",
        live_authority=False,
        review_verified=False,
        activation="not_implemented_by_this_tool",
    )
    try:
        template = draft()
        closed(value, template, "protocol")
        if (
            value["method"] != METHOD
            or value["role"] != "operator_planning_only"
            or value["live_authority"] is not False
        ):
            raise ValueError("planning role and false authority required")
        missing = []
        context = value["context"]
        closed(context, template["context"], "context")
        for key in ("scope", "source", "target_platform", "receiver_platform"):
            if (
                type(context[key]) is not str
                or context[key] != template["context"][key]
            ):
                raise ValueError("unsupported proposed context: " + key)
        closed(context["profile"], template["context"]["profile"], "context.profile")
        if any(
            type(context["profile"][key]) is not type(expected)
            or context["profile"][key] != expected
            for key, expected in template["context"]["profile"].items()
        ):
            raise ValueError("unsupported or mistyped proposed profile")
        for key, pattern in (
            ("image", r"sha256:[a-f0-9]{64}"),
            ("software_hash", r"[a-f0-9]{64}"),
        ):
            if context[key] is None:
                missing.append("context." + key)
            elif (
                type(context[key]) is not str
                or re.fullmatch(pattern, context[key]) is None
            ):
                raise ValueError("invalid " + key + " pin")
        text_or_missing(context["browser"], "context.browser", missing)
        operation = value["operation"]
        closed(operation, template["operation"], "operation")
        policy = operation["policy"]
        closed(policy, template["operation"]["policy"], "operation.policy")
        Policy(**policy)
        for key in ("baseline_fps", "target_fps", "requested_duration_ns"):
            if type(operation[key]) is not int:
                raise ValueError("integral operation required")
        baseline, target, duration = (
            operation[k]
            for k in ("baseline_fps", "target_fps", "requested_duration_ns")
        )
        if (baseline, target, duration) != (30, 24, 5000000000):
            raise ValueError(
                "versioned procedures require the fixed30to24FPS5s operation"
            )
        if duration + GRACE_NS > policy["cumulative_duration_ns"]:
            raise ValueError("full reservation exceeds proposed cumulative budget")
        if (
            baseline != 30
            or not policy["minimum_fps"] <= target < baseline <= policy["maximum_fps"]
            or not policy["settling_ns"] < duration <= policy["maximum_duration_ns"]
            or 100 * (baseline - target)
            > baseline * policy["maximum_reduction_percent"]
        ):
            raise ValueError("operation exceeds proposed engineering envelope")
        closed(value["procedures"], PROCEDURES, "procedures")
        if value["procedures"] != PROCEDURES:
            raise ValueError(
                "procedure versions changed; use a separate protocol revision"
            )
        closed(value["cost_limits"], LIMIT_SPECS, "cost_limits")
        for name, spec in LIMIT_SPECS.items():
            row = value["cost_limits"][name]
            closed(row, template["cost_limits"][name], "cost_limits." + name)
            if (
                tuple(row[k] for k in ("metric", "unit", "comparison", "interval"))
                != spec
            ):
                raise ValueError("cost metric/unit/interval substitution: " + name)
            limit = row["maximum"]
            if limit is None:
                missing.append("cost_limits." + name + ".maximum")
            elif (
                type(limit) not in (int, float)
                or not math.isfinite(limit)
                or not 0 <= limit <= 1000000000000
                or (spec[1] == "byte" and type(limit) is not int)
            ):
                raise ValueError("invalid finite cost limit: " + name)
            for key in ("rationale", "review_reference"):
                text_or_missing(row[key], "cost_limits." + name + "." + key, missing)
        for section, names in (
            ("quality", QUALITY),
            ("fault_scope", FAULT_SCOPE),
            ("exclusions", EXCLUSIONS),
        ):
            closed(value[section], names, section)
            for name in names:
                row = value[section][name]
                closed(row, template[section][name], section + "." + name)
                for key, entry in row.items():
                    label = section + "." + name + "." + key
                    if key == "disposition":
                        choices = (
                            ("pending", "required", "excluded")
                            if section == "fault_scope"
                            else ("pending", "accepted", "must_measure")
                        )
                        if entry not in choices:
                            raise ValueError("invalid scope disposition: " + label)
                        if entry == "pending":
                            missing.append(label)
                    elif key == "procedure" and (
                        (section == "fault_scope" and row["disposition"] == "excluded")
                        or (
                            section == "exclusions" and row["disposition"] == "accepted"
                        )
                    ):
                        if entry is not None:
                            raise ValueError(
                                "excluded scope must not declare an acquisition procedure"
                            )
                    else:
                        text_or_missing(entry, label, missing)
        closed(value["protocol_review"], template["protocol_review"], "protocol_review")
        for key, entry in value["protocol_review"].items():
            text_or_missing(entry, "protocol_review." + key, missing)
        rules = value["acquisition_rules"]
        closed(rules, template["acquisition_rules"], "acquisition_rules")
        if any(
            type(rules[k]) is not type(v) or rules[k] != v
            for k, v in template["acquisition_rules"].items()
        ):
            raise ValueError("prospective retention/clock rules cannot be weakened")
        result.update(
            protocol_state="draft_incomplete"
            if missing
            else "complete_declarations_unverified",
            missing_decisions=missing,
            document_hash=digest(value),
            qualification_acquisition="blocked_pending_complete_protocol_and_external_review"
            if missing
            else "requires_external_review_and_final_source_freeze",
            operation_limits="engineering_envelope_only_not_qualified",
            proposed_reservation_ns=duration + GRACE_NS,
            policy_facts="declarations_only_not_review_authentication",
        )
    except (ValueError, KeyError, TypeError, OverflowError) as error:
        result["reason"] = str(error)
    return result


def reject_constant(_value):
    raise ValueError("nonfinite JSON constant")


def main():
    if len(sys.argv) != 2:
        return 2
    try:
        with Path(sys.argv[1]).open("rb") as source:
            body = source.read(65537)
        if len(body) > 65536:
            raise ValueError("protocol byte bound")
        value = json.loads(
            body,
            object_pairs_hook=strict_object,
            parse_constant=reject_constant,
        )
        result = inspect(value)
    except (OSError, ValueError, UnicodeError, TypeError, RecursionError) as error:
        result = dict(
            protocol_state="invalid",
            reason=str(error),
            live_authority=False,
            qualification="unavailable_protocol_is_not_evidence",
        )
    print(json.dumps(result, indent=2, allow_nan=False))
    return 0 if result["protocol_state"] == "complete_declarations_unverified" else 1


if __name__ == "__main__":
    raise SystemExit(main())
