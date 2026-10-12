"""Additive capture-pacing export, with integer effects over actual frozen snapshots."""

import copy
import hashlib
import json

from .contracts import SECOND
from .export import _archive, experiment_files, unsupported_bundle_bytes
from .manifest_export import json_bytes, manifest_bytes

RELEASE = "n5-capture-pacing-v1"


def declarations(manifest, plan=None):
    value = copy.deepcopy(manifest)
    if (value.get("schema_version"), value.get("method_release"), value.get("scenario")) != (
        "experiment-manifest-v2",
        RELEASE,
        "render_capture_slowdown",
    ):
        raise ValueError("explicit pacing contract required")
    adapter = value["adapter"]
    if adapter["adapter_id"] != "bounded_capture_pacing":
        raise ValueError("bounded pacing adapter required")
    actions = value["actions"]
    expected = dict(
        action_id="action-1",
        kind="capture_pacing",
        workers=0,
        delay_us=50000,
        start_phase="degraded",
        stop_phase="recovery",
        max_duration_ns=value["phases"][2]["duration_ns"]
        + value["phases"][3]["duration_ns"]
        + 10 * SECOND,
    )
    if (
        actions != [expected]
        or type(actions[0]["workers"]) is not int
        or type(actions[0]["delay_us"]) is not int
        or type(actions[0]["max_duration_ns"]) is not int
    ):
        raise ValueError("fixed bounded pacing action required")
    if not 30 * SECOND <= expected["max_duration_ns"] - 10 * SECOND <= 290 * SECOND:
        raise ValueError("bounded pacing duration required")
    base = copy.deepcopy(value)
    base.update(
        schema_version="experiment-manifest-v1",
        method_release="n5-single-cause-v1",
        scenario="healthy",
        actions=[],
    )
    base["adapter"]["adapter_id"] = "none"
    manifest_bytes(base, plan)
    return value, base


def effect(result, files):
    empty = dict(
        healthy_fps=None,
        degraded_fps=None,
        recovery_fps=None,
        pressure_cpu_percent=None,
        capture_delay_ns=None,
    )
    reason = (
        "adapter_unavailable"
        if result["status"] == "unsupported"
        else "incomplete_run"
        if result["status"] != "completed"
        else "cleanup_unverified"
        if result["cleanup"]["state"] not in ("restored", "not_required")
        else None
    )
    evidence, traces = {}, {}
    for ref in result["artifacts"]:
        if ref["role"] == "phase_evidence":
            evidence[ref["phase"]] = json.loads(files[ref["file_name"]])
        elif ref["role"] == "stage_trace":
            traces[ref["phase"]] = json.loads(files[ref["file_name"]])
    if reason:
        return dict(state="unavailable", reason=reason, **empty)
    if len(evidence) != 6 or any(p["state"] != "complete" for p in evidence.values()):
        return dict(state="unavailable", reason="insufficient_evidence", **empty)
    totals, medians = [], []
    for phase in ("healthy", "degraded", "recovery"):
        item = evidence[phase]
        delays = []
        for stream in traces.get(phase, {}).get("streams", []):
            indexed = {}
            for event in stream["events"]:
                indexed.setdefault(event["frame_id"], {})[event["boundary"]] = event["timestamp_ns"]
            for frame in stream["frames"]:
                events = indexed.get(frame["frame_id"], {})
                if (
                    frame["correlation"] == "exact"
                    and "capture_output" in events
                    and "pre_encode_queue_enter" in events
                ):
                    delay = events["pre_encode_queue_enter"] - events["capture_output"]
                    if delay >= 0:
                        delays.append(delay)
        duration = item["end_ns"] - item["start_ns"]
        if len(item["intervals"]) < 30 or duration < 30 * SECOND or len(delays) < 30:
            return dict(state="unavailable", reason="insufficient_evidence", **empty)
        totals.append(
            (sum(i["frames_end"] - i["frames_start"] for i in item["intervals"]), duration)
        )
        medians.append(sorted(delays)[(len(delays) - 1) // 2])
    (h, ht), (d, dt), (r, rt) = totals
    baseline, delayed, restored = medians
    if h * SECOND < ht * 27:
        reason = "baseline_inadequate"
    elif min(delayed, delayed - baseline) < 40_000_000:
        reason = "pacing_not_observed"
    elif d * ht * 100 > h * dt * 95:
        reason = "degradation_not_observed"
    elif r * ht * 100 < h * rt * 95 or restored > baseline + 10_000_000:
        reason = "recovery_not_observed"
    return dict(
        state="failed" if reason else "verified",
        reason=reason,
        healthy_fps=h * SECOND / ht,
        degraded_fps=d * SECOND / dt,
        recovery_fps=r * SECOND / rt,
        pressure_cpu_percent=None,
        capture_delay_ns=delayed,
    )


def pacing_bundle_bytes(
    manifest,
    plan=None,
    execution=None,
    *,
    recordings=(),
    action_started_ns=None,
    action_stopped_ns=None,
    cleanup_ended_ns=None,
    restored=False,
):
    value, base = declarations(manifest, plan)
    if value["adapter"]["state"] == "unavailable":
        # Only our own bounded exporter output is decoded, never untrusted archives.
        import gzip
        import io
        import tarfile

        with tarfile.open(
            fileobj=io.BytesIO(gzip.decompress(unsupported_bundle_bytes(base))), mode="r:"
        ) as archive:
            files = {m.name: archive.extractfile(m).read() for m in archive}
    else:
        files = experiment_files(base, plan, execution, recordings=recordings)
    declaration = json_bytes(value)
    digest = hashlib.sha256(declaration).hexdigest()
    result = json.loads(files["experiment-result.json"])
    result.update(
        schema_version="experiment-result-v2", method_release=RELEASE, manifest_sha256=digest
    )
    files["experiment-manifest.json"] = declaration
    if result["status"] != "unsupported":
        stopped = action_stopped_ns is not None
        result["actions"] = [
            dict(
                action_id="action-1",
                state="not_started"
                if action_started_ns is None
                else "stopped"
                if stopped
                else "failed",
                started_ns=action_started_ns,
                stopped_ns=action_stopped_ns,
                reason=None if stopped or action_started_ns is None else "stop_failed",
            )
        ]
        if action_started_ns is not None:
            verified = restored and stopped and cleanup_ended_ns is not None
            result["cleanup"] = dict(
                state="restored" if verified else "unverified",
                reason=None if verified else "missing_evidence",
                started_ns=action_stopped_ns if verified else None,
                ended_ns=cleanup_ended_ns if verified else None,
                owned_workers_remaining=0,
            )
            if not verified and result["status"] == "completed":
                result.update(status="aborted", reason="cleanup_failed")
        elif result["status"] == "completed":
            result.update(status="aborted", reason="action_failed")
    for ref in result["artifacts"]:
        name = ref["file_name"]
        if ref["role"] == "phase_evidence":
            root = json.loads(files[name])
            root.update(
                schema_version="experiment-phase-evidence-v2",
                method_release=RELEASE,
                manifest_sha256=digest,
            )
            files[name] = json_bytes(root)
            ref["schema_version"] = root["schema_version"]
        ref.update(bytes=len(files[name]), sha256=hashlib.sha256(files[name]).hexdigest())
    result["effect"] = effect(result, files)
    files["experiment-result.json"] = json_bytes(result)
    return _archive(files)
