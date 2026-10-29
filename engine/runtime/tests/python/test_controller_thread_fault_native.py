"""Thread-only failure with actual streaming and real pidfd watchdog teardown."""

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from live_probe_control import CadenceController, Generation, Policy, Request


@unittest.skipUnless(
    sys.platform == "linux" and os.environ.get("N10_NATIVE_PEER_TESTS") == "1",
    "opt-in Linux synthetic streaming and pidfd watchdog",
)
class ControllerThreadFaultTests(unittest.TestCase):
    def check_fault(self, mode):
        with tempfile.TemporaryDirectory() as directory:
            result = subprocess.run(
                [
                    sys.executable,
                    str(Path(__file__).with_name("controller_thread_fault_worker.py")),
                    mode,
                    directory,
                ],
                capture_output=True,
                text=True,
                timeout=10,
                check=False,
            )
            self.assertEqual(result.returncode, -9, result.stderr + result.stdout)
            events = [json.loads(line) for line in result.stdout.splitlines()]
            self.assertEqual(events[0]["kind"], "fault_injected", events)
            fault, *after = events
            self.assertEqual((fault["mode"], fault["fps"]), (mode, 24))
            stable = [
                row
                for row in after
                if row["kind"] == "media_after_fault"
                and row["control_thread_alive"] is (mode == "block")
            ]
            self.assertGreaterEqual(len(stable), 3, events)
            self.assertTrue(all(row["fps"] == 24 for row in stable), events)
            self.assertGreater(stable[-1]["frames"], stable[0]["frames"] + 3)
            self.assertTrue(all(row["kind"] == "media_after_fault" for row in after))

            # Reopen the actual durable journal after the child has been reaped.
            # New dispatch remains blocked without explicit teardown recovery.
            port = type("UncalledPort", (), {"dedicated_process": True})()
            policy = Policy(
                24, 30, 1000000000, 1, 3000000000, 1000000000, 20, 100000000
            )
            with CadenceController(directory, policy, port, enabled=True) as owner:
                journal = owner.store.journal
                self.assertEqual(journal["state"], "active")
                self.assertEqual(
                    (journal["actions"], journal["reserved_ns"]), (1, 3000000000)
                )
                self.assertIsNone(journal["history"][0]["result"])
                self.assertIsNone(journal["history"][0]["failure"])
                with self.assertRaisesRegex(ValueError, "dirty cadence journal"):
                    owner.execute(
                        Request(
                            "next-action",
                            Generation(
                                "thread-fault-owner",
                                "thread-fault-pipeline",
                                "thread-fault-peer",
                            ),
                            24,
                            1000000000,
                        )
                    )

    def test_exited_controller_thread_cannot_leave_streaming_worker_alive(self):
        self.check_fault("exit")

    def test_blocked_controller_thread_cannot_leave_streaming_worker_alive(self):
        self.check_fault("block")
