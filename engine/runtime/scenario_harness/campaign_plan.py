"""Closed predeclared campaign schedule; no inferred workload or source independence."""

import json
import re

from .contracts import integer
from .manifest_export import closed

SCENARIOS = ("healthy", "host_contention", "render_capture_slowdown")


def unique(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate campaign key")
        result[key] = value
    return result


def validate(value):
    closed(
        value,
        "schema_version campaign_id core_version producer_version node_id workload_id "
        "node_version seed host_workers trials",
    )
    if value["schema_version"] != "n5-campaign-plan-v1":
        raise ValueError("explicit campaign plan required")
    for key, prefix in (
        ("campaign_id", "campaign"),
        ("node_id", "node"),
        ("workload_id", "workload"),
    ):
        if not isinstance(value[key], str) or not re.fullmatch(
            prefix + r"-[1-9][0-9]{0,8}", value[key]
        ):
            raise ValueError("sanitized campaign alias required")
    for key in ("core_version", "producer_version"):
        if not isinstance(value[key], str) or not re.fullmatch(r"[0-9a-f]{40}", value[key]):
            raise ValueError("exact checkout commit required")
    if not isinstance(value["node_version"], str) or not re.fullmatch(
        r"(?:0|[1-9][0-9]{0,2})(?:\.(?:0|[1-9][0-9]{0,2})){1,3}", value["node_version"]
    ):
        raise ValueError("explicit actual Node version required")
    integer(value["seed"], 0, 2**32 - 1)
    integer(value["host_workers"], 1, 8)
    trials = value["trials"]
    if type(trials) is not list or not 1 <= len(trials) <= 24:
        raise ValueError("bounded trial schedule required")
    for trial in trials:
        closed(trial, "run_id source_id scenario assignment repeat_index")
        if not isinstance(trial["run_id"], str) or not re.fullmatch(
            r"run-[1-9][0-9]{0,8}", trial["run_id"]
        ):
            raise ValueError("sanitized run alias required")
        if not isinstance(trial["source_id"], str) or not re.fullmatch(
            r"[0-9a-f]{32}", trial["source_id"]
        ):
            raise ValueError("predeclared acquisition ID required")
        if trial["scenario"] not in SCENARIOS or trial["assignment"] not in (
            "engineering",
            "reference",
            "held_out_query",
        ):
            raise ValueError("approved cause and predeclared assignment required")
        integer(trial["repeat_index"], 1, 100)
    for key in ("run_id", "source_id"):
        if len({t[key] for t in trials}) != len(trials):
            raise ValueError("source/run identity reuse forbidden")
    if len({(t["scenario"], t["assignment"], t["repeat_index"]) for t in trials}) != len(trials):
        raise ValueError("duplicate repetition forbidden")
    return value


def decode(data):
    if len(data) > 65536:
        raise ValueError("campaign plan exceeds bound")

    def constant(_value):
        raise ValueError("nonfinite campaign value")

    try:
        value = json.loads(data.decode("utf-8"), object_pairs_hook=unique, parse_constant=constant)
    except RecursionError:
        raise ValueError("campaign nesting exceeds bound") from None

    def depth(item, level=0):
        if level > 32:
            raise ValueError("campaign nesting exceeds bound")
        if isinstance(item, dict):
            for child in item.values():
                depth(child, level + 1)
        elif isinstance(item, list):
            for child in item:
                depth(child, level + 1)

    depth(value)
    return validate(value)
