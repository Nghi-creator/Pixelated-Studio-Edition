"""Sanitized immutable experiment artifacts, written only after owned cleanup."""

import gzip
import hashlib
import io
import json
import tarfile
from dataclasses import asdict, replace

from .contracts import MEASURED, PHASES, SECOND, Execution, RunPlan
from .effects import MeasuredEffect, evaluate_effect
from .manifest_export import closed, json_bytes, manifest_bytes

MAX_JSON_BYTES = 10 * 1024 * 1024
MAX_BUNDLE_BYTES = 64 * 1024 * 1024


def _archive(files):
    if len(files) > 20:
        raise ValueError("experiment member count exceeded")
    if (
        sum(512 + (len(data) + 511) // 512 * 512 for data in files.values()) + 10240
        > MAX_BUNDLE_BYTES
    ):
        raise ValueError("expanded experiment bound exceeded")
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode="w", format=tarfile.USTAR_FORMAT) as archive:
        for name, payload in files.items():
            if not 1 <= len(payload) <= MAX_JSON_BYTES:
                raise ValueError("experiment JSON bound exceeded")
            info = tarfile.TarInfo(name)
            info.size, info.mode = len(payload), 0o600
            archive.addfile(info, io.BytesIO(payload))
    raw = buffer.getvalue()
    if len(raw) > MAX_BUNDLE_BYTES:
        raise ValueError("expanded experiment bound exceeded")
    payload = gzip.compress(raw, mtime=0)
    if len(payload) > MAX_BUNDLE_BYTES:
        raise ValueError("compressed experiment bound exceeded")
    return payload


def unsupported_bundle_bytes(manifest):
    declaration = manifest_bytes(manifest)
    manifest = json.loads(declaration)
    if manifest["adapter"]["state"] != "unavailable":
        raise ValueError("explicit unavailable adapter required")
    result = dict(
        schema_version="experiment-result-v1",
        method_release="n5-single-cause-v1",
        manifest_sha256=hashlib.sha256(declaration).hexdigest(),
        run_id=manifest["run_id"],
        status="unsupported",
        reason=manifest["adapter"]["reason"],
        phases=[],
        actions=[],
        artifacts=[],
        effect=asdict(MeasuredEffect("unavailable", "adapter_unavailable")),
        cleanup=dict(
            state="not_required",
            reason=None,
            started_ns=None,
            ended_ns=None,
            owned_workers_remaining=0,
        ),
    )
    return _archive(
        {"experiment-manifest.json": declaration, "experiment-result.json": json_bytes(result)}
    )


def experiment_bundle_bytes(manifest, plan, execution, *, recordings=(), observation_windows=()):
    """No live runtime access. Missing frozen traces retain an aborted source result.

    Native IDs, private cleanup watchdog timestamps and diagnostics are never copied.
    Observation windows are explicit already-sanitized optional v2 roots; core
    adoption validates them independently and never derives them from N5 counters.
    """
    if not isinstance(plan, RunPlan) or not isinstance(execution, Execution):
        raise ValueError("executed bounded plan required")
    declaration = manifest_bytes(manifest, plan)
    manifest = json.loads(declaration)
    if manifest["adapter"]["state"] != "available":
        raise ValueError("executed adapter must be available")
    digest = hashlib.sha256(declaration).hexdigest()
    files, artifacts = {"experiment-manifest.json": declaration}, []

    def add(phase, role, root):
        payload = json_bytes(root)
        name = f"artifact-{len(artifacts) + 1}"
        artifacts.append(
            dict(
                artifact_id=name,
                file_name=name + ".json",
                phase=phase,
                role=role,
                schema_version=root.get("schema_version", root.get("schemaVersion")),
                bytes=len(payload),
                sha256=hashlib.sha256(payload).hexdigest(),
            )
        )
        files[name + ".json"] = payload

    phases = []
    for index, phase in enumerate(execution.phases):
        if index >= 6 or phase.phase != PHASES[index]:
            raise ValueError("actual phase prefix required")
        if len(phase.intervals) > 1200:
            raise ValueError("raw evidence interval bound exceeded")
        phases.append(
            dict(phase=phase.phase, start_ns=phase.start_ns, end_ns=phase.end_ns, state=phase.state)
        )
        reason = (
            phase.reason
            if phase.reason in ("cancelled", "timeout", "clock_error")
            else "source_unavailable"
        )
        state = (
            "complete"
            if phase.state == "complete" and phase.intervals
            else "partial"
            if phase.intervals
            else "unavailable"
        )
        rows = [
            dict(
                zip(
                    (
                        "start_ns",
                        "end_ns",
                        "frames_start",
                        "frames_end",
                        "active_workers",
                        "worker_cpu_ns",
                    ),
                    row,
                    strict=True,
                )
            )
            for row in phase.intervals
        ]
        add(
            phase.phase,
            "phase_evidence",
            dict(
                schema_version="experiment-phase-evidence-v1",
                method_release="n5-single-cause-v1",
                manifest_sha256=digest,
                run_id=plan.run_id,
                phase=phase.phase,
                clock_id=manifest["clock_id"],
                start_ns=phase.start_ns,
                end_ns=phase.end_ns,
                state=state,
                reason=None if state == "complete" else reason,
                intervals=rows,
            ),
        )
    seen, identities = set(), set()
    for phase, recording in recordings:
        if (
            phase not in MEASURED
            or phase not in {p["phase"] for p in phases}
            or phase in seen
            or id(recording) in identities
        ):
            raise ValueError("one distinct frozen collector per measured phase required")
        seen.add(phase)
        identities.add(id(recording))
        try:
            root = recording.snapshot(manifest["producer_version"], manifest["provenance"])
        except ValueError:
            continue  # Actual missing trace source is retained, never a warmup replacement.
        add(phase, "stage_trace", root)
    observations = set()
    for phase, window in observation_windows:
        if phase not in {p["phase"] for p in phases} or phase in observations:
            raise ValueError("one explicit observation per actual phase required")
        observations.add(phase)
        closed(
            window,
            "schemaVersion contractVersion runId windowId comparisonCaseId "
            "context phase provenance "
            "registry captureMethod clock sourceArtifact sources effectiveSettings measurements "
            "validity confounderCodes stageTimings",
        )
        if window.get("schemaVersion") != "observation-window-v2":
            raise ValueError("existing sanitized observation window required")
        add(phase, "observation_window", window)
    actual = execution
    complete_traces = {a["phase"] for a in artifacts if a["role"] == "stage_trace"}
    if execution.status == "completed" and (
        len(phases) != 6
        or complete_traces != set(MEASURED)
        or any(not p.intervals or p.state != "complete" for p in execution.phases)
    ):
        actual = replace(execution, status="aborted", reason="source_error")
    started, stopped = execution.action_started_ns, execution.action_stopped_ns
    actions = []
    if plan.workers:
        state = "not_started" if started is None else "stopped" if stopped is not None else "failed"
        reason = (
            (
                actual.reason
                if actual.reason in ("cancelled", "timeout")
                else "stop_failed"
                if execution.action_cleanup_started_ns is not None
                else "start_failed"
            )
            if state == "failed"
            else None
        )
        actions.append(
            dict(
                action_id="action-1",
                state=state,
                started_ns=started,
                stopped_ns=stopped,
                reason=reason,
            )
        )
    cleanup = dict(
        state="not_required", reason=None, started_ns=None, ended_ns=None, owned_workers_remaining=0
    )
    if execution.cleanup_state != "restored":
        cleanup.update(
            state="unverified",
            reason=execution.cleanup_reason or "missing_evidence",
            owned_workers_remaining=None,
        )
    elif started is not None:
        begin, end = execution.action_cleanup_started_ns, execution.action_cleanup_ended_ns
        if (
            stopped is not None
            and begin is not None
            and end is not None
            and 0 <= end - begin <= 10 * SECOND
        ):
            cleanup.update(state="restored", started_ns=begin, ended_ns=end)
        else:
            cleanup.update(state="unverified", reason="missing_evidence")
    if cleanup["state"] == "unverified" and actual.status == "completed":
        actual = replace(actual, status="aborted", reason="cleanup_failed")
    result = dict(
        schema_version="experiment-result-v1",
        method_release="n5-single-cause-v1",
        manifest_sha256=digest,
        run_id=plan.run_id,
        status=actual.status,
        reason=actual.reason,
        phases=phases,
        actions=actions,
        artifacts=artifacts,
        effect=asdict(evaluate_effect(plan, actual)),
        cleanup=cleanup,
    )
    files["experiment-result.json"] = json_bytes(result)
    return _archive(files)


def write_experiment_bundle(path, payload):
    # N5 has its own frozen bound; the earlier N4 writer/limit is unchanged.
    if not isinstance(payload, bytes) or len(payload) > MAX_BUNDLE_BYTES:
        raise ValueError("experiment output exceeds bound")
    from .output import write_atomic

    write_atomic(path, payload)
