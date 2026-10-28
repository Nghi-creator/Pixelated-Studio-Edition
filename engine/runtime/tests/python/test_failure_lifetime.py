"""Owned lifetime sampling rejects stale/foreign state and exports no private process identity."""

import copy
import os
import tempfile
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts" / "n10"))
from failure_lifetime import journal_read, process_hash, process_read
from live_probe_control.contracts import Policy, digest
from live_probe_control.journal import CadenceJournal
from live_probe_control.probe_transport import EngineeringControl


class Process:
    pid = 42

    def poll(self):
        return None


class LifetimeReadTests(unittest.TestCase):
    def test_hash_matches_private_journal_identity_without_exporting_preimage(self):
        boot = "12345678-1234-1234-1234-123456789012"
        self.assertEqual(
            process_hash(boot, 42, 123), digest(dict(boot=boot, pid=42, start="123"))
        )
        self.assertNotEqual(process_hash(boot, 42, 123), process_hash(boot, 42, 124))

    def test_process_read_requires_owned_live_child_and_stable_start(self):
        fields = ["0"] * 22
        fields[11], fields[12], fields[19] = "2", "3", "123"
        with (
            patch("failure_lifetime.subprocess.Popen", Process),
            patch("failure_lifetime.os.getpid", return_value=7),
            patch("failure_lifetime.process_identity", return_value=(7, 123)),
            patch(
                "failure_lifetime.Path.read_text",
                return_value="42 (name) " + " ".join(fields),
            ),
        ):
            row = process_read("boot", Process())
            self.assertEqual(
                row, dict(identity_hash=process_hash("boot", 42, 123), cpu_ticks=5)
            )
            with self.assertRaises(ValueError):
                process_read("boot", SimpleNamespace(pid=42, poll=lambda: None))
        with (
            patch("failure_lifetime.subprocess.Popen", Process),
            patch("failure_lifetime.os.getpid", return_value=7),
            patch(
                "failure_lifetime.process_identity", side_effect=[(7, 123), (7, 124)]
            ),
            patch(
                "failure_lifetime.Path.read_text",
                return_value="42 (name) " + " ".join(fields),
            ),
        ):
            with self.assertRaisesRegex(ValueError, "changed"):
                process_read("boot", Process())

    def test_foreign_parent_is_rejected(self):
        fields = ["0"] * 22
        fields[19] = "123"
        with (
            patch("failure_lifetime.subprocess.Popen", Process),
            patch("failure_lifetime.os.getpid", return_value=7),
            patch("failure_lifetime.process_identity", return_value=(8, 123)),
            patch(
                "failure_lifetime.Path.read_text",
                return_value="42 (name) " + " ".join(fields),
            ),
        ):
            with self.assertRaisesRegex(ValueError, "changed"):
                process_read("boot", Process())

    def fixture(self, directory):
        policy = Policy(24, 30, 2000000000, 2, 10000000000, 1000000000, 25, 200000000)
        control = EngineeringControl.open(directory, policy)
        req = dict(
            request_id="request",
            generation=dict(owner="owner", pipeline="pipe", peer="peer"),
            target_fps=24,
            duration_ns=2000000000,
        )
        raw = dict(
            version="n10-cadence-journal-v1",
            policy_hash=digest(policy.__dict__),
            state="active",
            actions=1,
            reserved_ns=4000000000,
            cooldown_until_ns=2**63 - 1,
            clock_boot="12345678-1234-1234-1234-123456789012",
            active="request",
            history=[
                dict(
                    request=req,
                    request_hash=digest(req),
                    prior=dict(
                        generation=req["generation"],
                        configured_fps=30,
                        negotiated_fps=30,
                        settings_hash="a" * 64,
                        healthy=True,
                    ),
                    process=dict(
                        boot="12345678-1234-1234-1234-123456789012", pid=42, start="123"
                    ),
                    reserved_ns=4000000000,
                    result=None,
                    failure=None,
                )
            ],
        )
        return control, raw

    def test_read_only_snapshot_works_while_writer_holds_lease_and_hides_private_fields(
        self,
    ):
        with tempfile.TemporaryDirectory() as directory:
            control, raw = self.fixture(directory)
            with CadenceJournal(directory) as writer:
                writer.save(raw)
                retained = copy.deepcopy(writer.journal)
                result = journal_read(control, directory)
                self.assertEqual(writer.journal, retained)
                self.assertIsNotNone(writer.fd)
                self.assertNotIn("clock_boot", result["projection"])
                self.assertNotIn("process", result["projection"]["history"][0])
                self.assertEqual(
                    result["projection"]["cooldown_until_ns_decimal"], str(2**63 - 1)
                )
                self.assertEqual(
                    result["projection_hash"], digest(result["projection"])
                )
                self.assertEqual(
                    result["private_content_hash"], writer.journal["content_hash"]
                )
                self.assertEqual(
                    result["projection"]["history"][0]["process_hash"],
                    digest(raw["history"][0]["process"]),
                )
                writer.save(
                    raw
                )  # Observation neither releases nor damages the writer's lease.

    def test_wrong_directory_binding_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            control, _ = self.fixture(directory)
            foreign = SimpleNamespace(
                check=MagicMock(side_effect=ValueError("scope changed"))
            )
            with self.assertRaisesRegex(ValueError, "scope changed"):
                journal_read(foreign, directory)

    def test_read_only_snapshot_rejects_symlink_target_and_public_mode(self):
        with tempfile.TemporaryDirectory() as directory:
            control, raw = self.fixture(directory)
            with CadenceJournal(directory) as writer:
                writer.save(raw)
                target = Path(directory) / "journal.json"
                target.rename(Path(directory) / "retained.json")
                target.symlink_to(Path(directory) / "retained.json")
                with self.assertRaises(OSError):
                    journal_read(control, directory)
                target.unlink()
                (Path(directory) / "retained.json").rename(target)
                os.chmod(directory, 0o755)
                try:
                    with self.assertRaises(ValueError):
                        journal_read(control, directory)
                finally:
                    os.chmod(directory, 0o700)
