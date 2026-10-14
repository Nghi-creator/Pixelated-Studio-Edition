"""Actual producer collectors/export with independent synthetic totals; no live action."""

import gzip
import hashlib
import io
import json
import sys
import tarfile
import tempfile
import unittest
from dataclasses import replace
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from camera_trace import HostTraceRecording
from camera_trace_config import ENGINE_EVENTS
from scenario_harness import (
    experiment_bundle_bytes,
    unsupported_bundle_bytes,
    write_experiment_bundle,
)
from test_scenario_adapters import execution, plan


def declaration(value):
    return dict(
        schema_version="experiment-manifest-v1",
        method_release="n5-single-cause-v1",
        experiment_id="experiment-1",
        run_id=value.run_id,
        node_id="node-1",
        workload_id="workload-1",
        clock_id="clock-1",
        provenance="synthetic",
        scenario=value.scenario,
        seed=value.seed,
        repeat_index=1,
        assignment="engineering",
        core_version="a" * 40,
        producer_version="b" * 40,
        runtime=dict(
            kind="synthetic",
            python_version="3.14.4",
            node_version="26.4.0",
            gst_version="1.28.2",
            cpu_allocation=2,
            width=1280,
            height=720,
            fps=30,
            codec="vp8",
            clock_source="python_monotonic_ns",
            clock_resolution_ns=1,
        ),
        adapter=dict(
            adapter_id="bounded_cpu_pressure" if value.workers else "none",
            state="available",
            reason=None,
        ),
        phases=[
            dict(phase=name, duration_ns=duration)
            for name, duration in zip(
                ("warmup", "healthy", "degraded", "probe", "recovery", "cooldown"),
                value.durations_ns,
                strict=True,
            )
        ],
        actions=[
            dict(
                action_id="action-1",
                kind="cpu_pressure",
                start_phase="degraded",
                stop_phase="recovery",
                workers=value.workers,
                max_duration_ns=sum(value.durations_ns[2:4]) + 10_000_000_000,
            )
        ]
        if value.workers
        else [],
        trace_policy=dict(scope="per_phase", every_nth_frame=1, max_frames=2000, max_events=10000),
    )


def collectors(value, run):
    result = []
    for phase in run.phases[1:5]:
        clock = [0]
        recording = HostTraceRecording(value.trace_config, lambda clock=clock: clock[0])
        stream = recording.begin()
        frames = sum(row[3] - row[2] for row in phase.intervals)
        for frame in range(frames):
            clock[0] = frame * 33_333_333
            recording.capture(stream, frame)
            for boundary in ENGINE_EVENTS[1:]:
                clock[0] += 1_000_000
                recording.endpoint(stream, boundary, frame)
        recording.finish()
        result.append((phase.phase, recording))
    return tuple(result)


def unpack(payload):
    with tarfile.open(fileobj=io.BytesIO(gzip.decompress(payload)), mode="r:") as archive:
        return {member.name: archive.extractfile(member).read() for member in archive}


class ExportTests(unittest.TestCase):
    def test_actual_collectors_hashes_raw_evidence_and_determinism(self):
        value, run = plan(), execution()
        recordings = collectors(value, run)
        payload = experiment_bundle_bytes(declaration(value), value, run, recordings=recordings)
        self.assertEqual(
            payload, experiment_bundle_bytes(declaration(value), value, run, recordings=recordings)
        )
        files = unpack(payload)
        result = json.loads(files["experiment-result.json"])
        self.assertEqual(
            result["manifest_sha256"], hashlib.sha256(files["experiment-manifest.json"]).hexdigest()
        )
        self.assertEqual(result["effect"]["state"], "verified")
        self.assertEqual(len(files), 12)
        for reference in result["artifacts"]:
            data = files[reference["file_name"]]
            self.assertEqual(reference["bytes"], len(data))
            self.assertEqual(reference["sha256"], hashlib.sha256(data).hexdigest())
        self.assertNotIn(b"generation", b"".join(files.values()))

    def test_missing_traces_retained_as_aborted_not_fabricated_completed(self):
        value, run = plan(), execution()
        result = json.loads(
            unpack(experiment_bundle_bytes(declaration(value), value, run))[
                "experiment-result.json"
            ]
        )
        self.assertEqual(
            (result["status"], result["reason"], result["effect"]["reason"]),
            ("aborted", "source_error", "incomplete_run"),
        )
        self.assertEqual(len(result["artifacts"]), 6)

    def test_unsupported_has_no_execution_or_rates(self):
        manifest = declaration(plan())
        manifest["adapter"].update(state="unavailable", reason="runtime_unavailable")
        files = unpack(unsupported_bundle_bytes(manifest))
        self.assertEqual(len(files), 2)
        result = json.loads(files["experiment-result.json"])
        self.assertEqual(result["status"], "unsupported")
        self.assertEqual((result["phases"], result["actions"], result["artifacts"]), ([], [], []))
        self.assertIsNone(result["effect"]["healthy_fps"])

    def test_partial_unknown_stop_never_copies_private_watchdog_times(self):
        value = plan()
        run = replace(
            execution(),
            status="aborted",
            reason="cancelled",
            phases=execution().phases[:3],
            action_stopped_ns=None,
            action_cleanup_started_ns=None,
            action_cleanup_ended_ns=None,
            cleanup_started_ns=9_000_000_000_000_000,
            cleanup_ended_ns=9_000_000_000_000_001,
        )
        files = unpack(experiment_bundle_bytes(declaration(value), value, run))
        result = json.loads(files["experiment-result.json"])
        self.assertEqual(result["cleanup"]["state"], "unverified")
        self.assertIsNone(result["cleanup"]["started_ns"])
        self.assertEqual(result["actions"][0]["state"], "failed")
        self.assertNotIn(b"9000000000000000", b"".join(files.values()))

    def test_foreign_metadata_or_reused_collectors_fail_before_output(self):
        value, run = plan(), execution()
        manifest = declaration(value)
        manifest["private_path"] = "/private/secret"
        with self.assertRaises(ValueError):
            experiment_bundle_bytes(manifest, value, run)
        recordings = collectors(value, run)
        with self.assertRaises(ValueError):
            experiment_bundle_bytes(
                declaration(value),
                value,
                run,
                recordings=(recordings[0], ("degraded", recordings[0][1])),
            )
        manifest = declaration(value)
        manifest["seed"] += 1
        with self.assertRaises(ValueError):
            experiment_bundle_bytes(manifest, value, run)

    def test_atomic_private_output_rejects_symlinks_and_preserves_old_file(self):
        payload = unsupported_bundle_bytes(
            dict(
                declaration(plan()),
                adapter=dict(
                    adapter_id="bounded_cpu_pressure",
                    state="unavailable",
                    reason="runtime_unavailable",
                ),
            )
        )
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory).resolve() / "experiment.gz"
            write_experiment_bundle(path, payload)
            self.assertEqual(path.read_bytes(), payload)
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            with self.assertRaises(ValueError):
                write_experiment_bundle(path, "not bytes")
            self.assertEqual(path.read_bytes(), payload)
            alias = path.with_name("alias.gz")
            alias.symlink_to(path)
            with self.assertRaises(ValueError):
                write_experiment_bundle(alias, payload)


if __name__ == "__main__":
    unittest.main()
