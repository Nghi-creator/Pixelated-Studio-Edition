"""Reviewed uncompressed-content pins from independently authored core N5 fixtures."""

import gzip
import hashlib
import importlib.util
import io
import json
import subprocess
import sys
import tarfile
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[4] / "scripts/n5/exportSyntheticExperiments.py"
spec = importlib.util.spec_from_file_location("synthetic_experiments", SCRIPT)
producer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(producer)
# Release 1.0.0. Gzip container bytes are not portable across Python versions.
EXPECTED_CONTENT_SHA256 = {
    "boundary": "c69a2f458a02cdfa4863cf1ba96e34f136df1cc8b5ec1bbdf3af764637317923",
    "cancelled": "44f8b7835a2d529aa930a2f305aa92178c0f69575ea62ef576a3b0da4bf08c4f",
    "failed-pressure": "d1fcac0f152a04e052df18eaec943086c254ea5b802aef587cc99a5fab9da515",
    "healthy": "6968b9d00d523d45c3d9ee9aee12294112e194bf5e329af6195515f322ebdbb2",
    "host": "d770b97c11e8bb0be120cf924de991eaa7182e073c0c6b4349aad1f0ba728327",
    "missing-trace": "56671fc9947671eb5eaa6017703d4b1342722340cbd5c265989a7d30c0a73555",
    "unknown-cleanup": "05f8ad2adf8cdf606ef95fad713c2483d371bf6168880a8951549012797884a5",
    "unsupported": "53434733480c9edd01689a0b185c09faaf11b4369e80109ffbc8587e9f3cd2a3",
}


class ReproductionTests(unittest.TestCase):
    def test_actual_synthetic_export_matches_independent_release_pins(self):
        with tempfile.TemporaryDirectory() as temporary:
            destination = Path(temporary).resolve()
            producer.export(destination)
            first = {p.name: p.read_bytes() for p in destination.iterdir()}
            self.assertEqual(set(first), {case + ".tar.gz" for case in EXPECTED_CONTENT_SHA256})
            for case, expected in EXPECTED_CONTENT_SHA256.items():
                with (
                    self.subTest(case=case),
                    tarfile.open(
                        fileobj=io.BytesIO(gzip.decompress(first[case + ".tar.gz"])), mode="r:"
                    ) as archive,
                ):
                    hashes = {
                        m.name: hashlib.sha256(archive.extractfile(m).read()).hexdigest()
                        for m in archive
                    }
                digest = hashlib.sha256(
                    json.dumps(hashes, sort_keys=True, separators=(",", ":")).encode()
                ).hexdigest()
                self.assertEqual(digest, expected)
            producer.export(destination)
            self.assertEqual(first, {p.name: p.read_bytes() for p in destination.iterdir()})

    def test_command_has_fixed_error_and_no_input_echo(self):
        with tempfile.TemporaryDirectory() as temporary:
            destination = Path(temporary).resolve() / "private-secret" / "missing"
            result = subprocess.run(  # noqa: S603 - fixed local script, interpreter and temp path.
                [sys.executable, str(SCRIPT), str(destination)],
                capture_output=True,
                text=True,
                timeout=10,
            )
            self.assertEqual(result.returncode, 1)
            self.assertEqual(
                (result.stdout, result.stderr), ("", "error: N5 synthetic export failed\n")
            )
            self.assertFalse(destination.exists())

    def test_command_exports_every_case_silently(self):
        with tempfile.TemporaryDirectory() as temporary:
            destination = Path(temporary).resolve()
            result = subprocess.run(  # noqa: S603 - fixed local script, interpreter and temp path.
                [sys.executable, str(SCRIPT), str(destination)],
                capture_output=True,
                text=True,
                timeout=10,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual((result.stdout, result.stderr), ("", ""))
            self.assertEqual(len(list(destination.iterdir())), 8)
            self.assertTrue(all(p.stat().st_mode & 0o777 == 0o600 for p in destination.iterdir()))


if __name__ == "__main__":
    unittest.main()
