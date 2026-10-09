import gzip
import hashlib
import io
import json
import sys
import tarfile
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from camera_trace import HostTraceRecording
from camera_trace_config import TraceConfig
from camera_trace_export import export_camera_trace, trace_bundle_bytes, write_trace_bundle


class ExportTests(unittest.TestCase):
    def recording(self):
        recording = HostTraceRecording(TraceConfig())
        recording.begin()
        recording.finish()
        return recording

    def test_two_regular_members_and_canonical_hash(self):
        recording = self.recording()
        payload = trace_bundle_bytes(recording, "a" * 40, "synthetic")
        with tarfile.open(fileobj=io.BytesIO(payload), mode="r:gz") as archive:
            self.assertEqual(archive.getnames(), ["trace-manifest.json", "trace-record.json"])
            self.assertTrue(all(member.isfile() for member in archive.getmembers()))
            manifest = json.load(archive.extractfile("trace-manifest.json"))
            trace = archive.extractfile("trace-record.json").read()
        self.assertEqual(manifest["trace_sha256"], hashlib.sha256(trace).hexdigest())
        self.assertEqual(manifest["trace_bytes"], len(trace))
        self.assertEqual(
            trace, (json.dumps(json.loads(trace), indent=2, sort_keys=True) + "\n").encode()
        )
        self.assertEqual(payload, trace_bundle_bytes(recording, "a" * 40, "synthetic"))
        self.assertLess(len(gzip.decompress(payload)), 32 * 1024 * 1024)

    def test_requires_finish_and_commit(self):
        with self.assertRaises(ValueError):
            trace_bundle_bytes(HostTraceRecording(TraceConfig()), "a" * 40)
        with self.assertRaises(ValueError):
            trace_bundle_bytes(self.recording(), "private-version")

    def test_no_lifetime_does_not_publish_invalid_artifact(self):
        recording = HostTraceRecording(TraceConfig())
        recording.finish()
        with self.assertRaises(ValueError):
            trace_bundle_bytes(recording, "a" * 40)

    def test_export_byte_limits_preserve_existing_output(self):
        for setting in ("MAX_JSON_BYTES", "MAX_BUNDLE_BYTES"):
            with patch(f"camera_trace_export.{setting}", 1), self.assertRaises(ValueError):
                trace_bundle_bytes(self.recording(), "a" * 40)
        with tempfile.TemporaryDirectory(
            dir="/private/tmp" if Path("/private/tmp").exists() else None
        ) as directory:
            target = Path(directory) / "trace.tar.gz"
            target.write_bytes(b"old")
            with patch("camera_trace_export.MAX_BUNDLE_BYTES", 1), self.assertRaises(ValueError):
                write_trace_bundle(target, b"oversize")
            self.assertEqual(target.read_bytes(), b"old")
            self.assertEqual(list(Path(directory).glob(".n4-*.tmp")), [])

    def test_atomic_replace_and_mode(self):
        with tempfile.TemporaryDirectory(
            dir="/private/tmp" if Path("/private/tmp").exists() else None
        ) as directory:
            target = Path(directory) / "trace.tar.gz"
            target.write_bytes(b"old")
            payload = trace_bundle_bytes(self.recording(), "a" * 40)
            write_trace_bundle(target, payload)
            self.assertEqual(target.read_bytes(), payload)
            self.assertEqual(target.stat().st_mode & 0o777, 0o600)

    def test_failures_preserve_existing_and_remove_temp(self):
        for operation in ("replace", "fsync"):
            with tempfile.TemporaryDirectory(
                dir="/private/tmp" if Path("/private/tmp").exists() else None
            ) as directory:
                target = Path(directory) / "trace.tar.gz"
                target.write_bytes(b"old")
                with (
                    patch(
                        f"camera_trace_export.os.{operation}", side_effect=OSError("private-error")
                    ),
                    self.assertRaises(OSError),
                ):
                    write_trace_bundle(target, b"new")
                self.assertEqual(target.read_bytes(), b"old")
                self.assertEqual(list(Path(directory).glob(".n4-*.tmp")), [])

    def test_symlink_leaf_and_ancestor_are_not_followed(self):
        with tempfile.TemporaryDirectory(
            dir="/private/tmp" if Path("/private/tmp").exists() else None
        ) as directory:
            root = Path(directory)
            real = root / "real"
            real.mkdir()
            outside = real / "trace.tar.gz"
            outside.write_bytes(b"old")
            alias = root / "alias"
            alias.symlink_to(real, target_is_directory=True)
            leaf = root / "leaf"
            leaf.symlink_to(outside)
            for target in (alias / "trace.tar.gz", leaf):
                with self.assertRaises((ValueError, OSError)):
                    write_trace_bundle(target, b"new")
            self.assertEqual(outside.read_bytes(), b"old")

    def test_disabled_and_no_output_skip_without_snapshot(self):
        self.assertFalse(export_camera_trace(None, {"PIXELATED_STAGE_TRACE_OUTPUT": "ignored"}))
        self.assertFalse(export_camera_trace(object(), {}))

    def test_invalid_export_keeps_artifact_and_fixed_diagnostic(self):
        with tempfile.TemporaryDirectory(
            dir="/private/tmp" if Path("/private/tmp").exists() else None
        ) as directory:
            target = Path(directory) / "trace.tar.gz"
            target.write_bytes(b"old")
            with patch("builtins.print") as diagnostic:
                self.assertFalse(
                    export_camera_trace(
                        self.recording(),
                        {
                            "PIXELATED_STAGE_TRACE_OUTPUT": str(target),
                            "PIXELATED_STAGE_TRACE_PRODUCER_VERSION": "secret",
                        },
                    )
                )
            diagnostic.assert_called_once_with(
                "[N4] Stage trace export failed; no artifact published."
            )
            self.assertEqual(target.read_bytes(), b"old")

    def test_configured_shutdown_export(self):
        with tempfile.TemporaryDirectory(
            dir="/private/tmp" if Path("/private/tmp").exists() else None
        ) as directory:
            target = Path(directory) / "trace.tar.gz"
            self.assertTrue(
                export_camera_trace(
                    self.recording(),
                    {
                        "PIXELATED_STAGE_TRACE_OUTPUT": str(target),
                        "PIXELATED_STAGE_TRACE_PRODUCER_VERSION": "a" * 40,
                    },
                )
            )
            self.assertTrue(target.read_bytes().startswith(b"\x1f\x8b"))


if __name__ == "__main__":
    unittest.main()
