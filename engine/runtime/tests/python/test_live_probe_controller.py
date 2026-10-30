"""Private cadence lifecycle failure drills; fake ports do not qualify playback."""

import json
import os
import subprocess
import sys
import tempfile
import unittest
from dataclasses import replace
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from live_probe_control import CadenceController, Generation, Policy, Request, Snapshot
from live_probe_control.journal import CadenceJournal

SECOND = 10**9
GEN = Generation("owner-1", "pipeline-1", "peer-1")
BOOT = "00000000-0000-0000-0000-000000000001"
POLICY = Policy(24, 60, 2 * SECOND, 3, 12 * SECOND, SECOND, 20, 100000000)


class Port:
    dedicated_process = True

    def __init__(self):
        self.fps = 30
        self.negotiated = 30
        self.gen = GEN
        self.healthy = True
        self.settings = "a" * 64
        self.calls = []
        self.fail_apply = self.fail_restore = self.foreign = self.replaced = False
        self.proof = True
        self.before_set = None

    def snapshot(self):
        return Snapshot(self.gen, self.fps, self.negotiated, self.settings, self.healthy)

    def set_fps(self, value):
        if self.before_set:
            self.before_set(value)
        self.calls.append(value)
        if value == 30 and self.fail_restore:
            raise RuntimeError("PRIVATE restore failure")
        self.fps = self.negotiated = value
        if value == 24:
            if self.replaced:
                self.gen = Generation("owner-1", "pipeline-2", "peer-2")
            if self.foreign:
                self.fps = self.negotiated = 25
            if self.fail_apply:
                raise RuntimeError("PRIVATE after mutation")

    def verify_restored(self, prior, deadline_ns):
        return self.proof and self.snapshot() == prior


class Clock:
    def __init__(self):
        self.now = 10 * SECOND

    def read(self):
        return self.now

    def sleep(self, seconds):
        self.now += int(seconds * SECOND)


class Guard:
    def __init__(self):
        self.armed = False
        self.cancelled = False
        self.fail = False

    def arm(self, duration):
        if self.fail:
            raise ValueError("watchdog unavailable")
        self.armed = duration

    def disarm(self):
        self.cancelled = True


class ControllerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)
        self.port = Port()
        self.clock = Clock()
        self.guards = []

    def guard(self):
        value = Guard()
        self.guards.append(value)
        return value

    def control(self, **options):
        defaults = dict(
            enabled=True,
            watchdog_factory=self.guard,
            clock=self.clock.read,
            sleep=self.clock.sleep,
            identity=lambda: dict(boot=BOOT, pid=123, start="100"),
            gone=lambda _identity: False,
        )
        defaults.update(options)
        return CadenceController(self.directory, POLICY, self.port, **defaults)

    def request(self, name="request-1", **options):
        return Request(
            name,
            options.get("generation", GEN),
            options.get("fps", 24),
            options.get("duration", SECOND),
        )

    def test_disabled_is_default_and_never_touches_port(self):
        with (
            self.control(enabled=False) as control,
            patch.object(
                self.port, "snapshot", side_effect=AssertionError("disabled port touched")
            ),
            self.assertRaises(ValueError),
        ):
            control.execute(self.request())
        self.assertFalse((self.directory / "journal.json").exists())

    def test_intent_is_durable_before_any_mutation_and_success_is_idempotent(self):
        def inspect_intent(_value):
            saved = json.loads((self.directory / "journal.json").read_text())
            self.assertEqual(saved["state"], "active")
            self.assertEqual(saved["actions"], 1)
            self.assertEqual(saved["reserved_ns"], 3 * SECOND)
            self.assertTrue(self.guards[0].armed)

        self.port.before_set = inspect_intent
        with self.control() as control:
            result = control.execute(self.request())
            self.assertEqual(result.outcome, "completed")
            self.assertFalse(result.live_authority)
            self.assertEqual(control.execute(self.request()), result)
            self.assertEqual(self.port.calls, [24, 30])
            self.assertTrue(self.guards[0].cancelled)
        with self.control() as control:
            self.assertEqual(control.execute(self.request()), result)
            with self.assertRaises(ValueError):
                control.execute(self.request(duration=2 * SECOND))

    def test_private_lease_excludes_a_second_owner(self):
        with self.control(), self.assertRaises(BlockingIOError), self.control():
            pass

    def test_recursive_concurrent_request_is_rejected(self):
        with self.control() as control:

            def attempt(_value):
                with self.assertRaises(ValueError):
                    control.execute(self.request("nested"))

            self.port.before_set = attempt
            result = control.execute(self.request())
            self.assertEqual(result.outcome, "completed")

    def test_preconditions_fail_without_reservation_or_setter(self):
        for request in (
            self.request(generation=Generation("stale", "pipeline-1", "peer-1")),
            self.request(fps=30),
            self.request(duration=3 * SECOND),
        ):
            with self.control() as control, self.assertRaises(ValueError):
                control.execute(request)
        self.assertEqual(self.port.calls, [])

    def test_partial_apply_failure_restores_and_caches_abort(self):
        self.port.fail_apply = True
        with self.control() as control:
            result = control.execute(self.request())
            self.assertEqual(result.outcome, "aborted")
            self.assertEqual(result.reason, "apply_failed")
            self.assertEqual(result.restoration, "verified_by_port")
            self.assertEqual(control.execute(self.request()), result)
        self.assertEqual(self.port.calls, [24, 30])

    def test_cancel_and_health_abort_restore(self):
        checks = [False, False, True]
        with self.control() as control:
            result = control.execute(
                self.request(), cancelled=lambda: checks.pop(0) if checks else True
            )
            self.assertEqual(result.reason, "cancelled")
            self.assertEqual(result.restoration, "verified_by_port")

    def test_foreign_values_and_replaced_generation_are_never_overwritten(self):
        for flag in ("foreign", "replaced"):
            with self.subTest(flag=flag):
                self.port = Port()
                setattr(self.port, flag, True)
                with self.control() as control:
                    result = control.execute(self.request(flag))
                    self.assertEqual(result.restoration, "unknown")
                    self.assertEqual(control.execute(self.request(flag)), result)
                    with self.assertRaises(ValueError):
                        control.execute(self.request("new"))
                self.assertEqual(self.port.calls, [24])
                self.assertFalse(self.guards[-1].cancelled)
                # Explicit proven teardown on a new controller resolves the old
                # interrupted worker, without pretending a live rollback occurred.
                with self.control(gone=lambda _identity: True) as control:
                    self.assertTrue(control.recover_after_teardown())
                self.clock.now += SECOND

    def test_failed_restore_or_missing_independent_proof_remains_dirty(self):
        self.port.proof = False
        with self.control() as control:
            result = control.execute(self.request())
            self.assertEqual(result.restoration, "unknown")
            self.assertEqual(control.store.journal["state"], "dirty")
            with self.assertRaises(ValueError):
                control.recover_after_teardown()
        self.assertFalse(self.guards[0].cancelled)

    def test_teardown_recovery_retains_budgets_and_imposes_cooldown(self):
        self.port.proof = False
        with self.control() as control:
            control.execute(self.request())
        self.port = Port()
        with self.control(gone=lambda _identity: True) as control:
            self.assertTrue(control.recover_after_teardown())
            result = control.execute(self.request())
            self.assertEqual(result.outcome, "interrupted_teardown")
            self.assertEqual(control.store.journal["actions"], 1)
            self.assertEqual(control.store.journal["reserved_ns"], 3 * SECOND)
            with self.assertRaises(ValueError):
                control.execute(self.request("new"))

    def test_cooldown_and_cumulative_count_survive_reopen(self):
        for index in range(3):
            with self.control() as control:
                control.execute(self.request(f"request-{index}"))
                with self.assertRaises(ValueError):
                    control.execute(self.request("cooldown"))
            self.clock.now += SECOND
        with self.control() as control, self.assertRaises(ValueError):
            control.execute(self.request("over-budget"))

    def test_failed_intent_write_never_arms_or_mutates(self):
        with (
            self.control() as control,
            patch.object(control.store, "save", side_effect=OSError("disk")),
            self.assertRaises(OSError),
        ):
            control.execute(self.request())
        self.assertFalse(self.guards)
        self.assertFalse(self.port.calls)

    def test_failed_watchdog_start_cannot_mutate_or_enable_another_action(self):
        def fail_guard():
            guard = self.guard()
            guard.fail = True
            return guard

        with self.control(watchdog_factory=fail_guard) as control:
            result = control.execute(self.request())
            self.assertEqual(result.restoration, "unknown")
            self.assertFalse(self.port.calls)
            self.assertEqual(control.store.journal["state"], "dirty")
            self.assertEqual(control.execute(self.request()), result)
            with self.assertRaises(ValueError):
                control.execute(self.request("another"))

    def test_final_journal_failure_keeps_watchdog_and_durable_active_intent(self):
        with self.control() as control:
            original = control.store.save
            calls = [0]

            def save(value):
                calls[0] += 1
                if calls[0] > 1:
                    raise OSError("disk failure")
                original(value)

            with patch.object(control.store, "save", side_effect=save), self.assertRaises(OSError):
                control.execute(self.request())
            self.assertEqual(control.store.journal["state"], "active")
        self.assertFalse(self.guards[0].cancelled)
        with self.control() as control, self.assertRaises(ValueError):
            control.execute(self.request("new"))

    def test_failed_clean_commit_after_ack_retains_blocking_pending_intent(self):
        with self.control() as control:
            original = control.store.save
            calls = [0]

            def save(value):
                calls[0] += 1
                if calls[0] == 3:
                    raise OSError("final clean commit failed")
                original(value)

            with patch.object(control.store, "save", side_effect=save), self.assertRaises(OSError):
                control.execute(self.request())
            self.assertEqual(control.store.journal["state"], "restored_pending_watchdog")
            self.assertTrue(self.guards[0].cancelled)
        with self.control() as control, self.assertRaises(ValueError):
            control.execute(self.request("new"))

    def test_failed_watchdog_acknowledgement_never_commits_clean(self):
        def guard():
            value = self.guard()

            def failed_ack():
                raise ValueError("watchdog acknowledgement lost")

            value.disarm = failed_ack
            return value

        with self.control(watchdog_factory=guard) as control:
            with self.assertRaises(ValueError):
                control.execute(self.request())
            self.assertEqual(control.store.journal["state"], "restored_pending_watchdog")
        with self.control() as control, self.assertRaises(ValueError):
            control.execute(self.request("new"))

    def test_recovery_policy_cannot_shorten_original_cooldown(self):
        self.port.proof = False
        with self.control() as control:
            control.execute(self.request())
        with self.control(gone=lambda _identity: True) as control:
            control.policy = replace(POLICY, cooldown_ns=2 * SECOND)
            with self.assertRaises(ValueError):
                control.recover_after_teardown()

    def test_policy_change_cannot_reset_budgets(self):
        with self.control() as control:
            control.execute(self.request())
        with self.control() as control:
            control.policy = replace(POLICY, maximum_actions=4)
            with self.assertRaises(ValueError):
                control.execute(self.request("new"))

    def test_journal_rejects_symlinks_duplicates_and_reconstructed_budget_corruption(self):
        (self.directory / "journal.json").symlink_to(self.directory / "foreign")
        with self.assertRaises(OSError), self.control():
            pass
        (self.directory / "journal.json").unlink()
        with self.control() as control:
            control.execute(self.request())
        target = self.directory / "journal.json"
        raw = json.loads(target.read_text())
        raw["reserved_ns"] = 0
        target.write_text(json.dumps(raw))
        with self.assertRaises(ValueError), CadenceJournal(self.directory):
            pass
        target.write_text('{"version":1,"version":2}')
        with self.assertRaises(ValueError), CadenceJournal(self.directory):
            pass


@unittest.skipUnless(sys.platform == "linux" and hasattr(os, "pidfd_open"), "Linux pidfd only")
class NativeWatchdogTests(unittest.TestCase):
    def test_lost_control_pipe_triggers_exact_worker_teardown(self):
        root = Path(__file__).resolve().parents[2]
        code = (
            "from live_probe_control.watchdog import PidfdWatchdog; import os,time; "
            "w=PidfdWatchdog(); w.arm(2000000000); os.close(w.write_fd); time.sleep(10)"
        )
        result = subprocess.run(  # noqa: S603 -- fixed owned child
            [sys.executable, "-c", code], cwd=root, capture_output=True, timeout=5
        )
        self.assertEqual(result.returncode, -9)

    def test_independent_deadline_kills_only_the_owned_blocked_worker(self):
        root = Path(__file__).resolve().parents[2]
        code = (
            "from live_probe_control.watchdog import PidfdWatchdog; import time; "
            "w=PidfdWatchdog(); w.arm(250000000); time.sleep(10)"
        )
        result = subprocess.run(  # noqa: S603 -- fixed owned child
            [sys.executable, "-c", code], cwd=root, capture_output=True, timeout=5
        )
        self.assertEqual(result.returncode, -9)

    def test_verified_disarm_allows_owned_worker_to_survive_deadline(self):
        root = Path(__file__).resolve().parents[2]
        code = (
            "from live_probe_control.watchdog import PidfdWatchdog; import time; "
            "w=PidfdWatchdog(); w.arm(250000000); w.disarm(); time.sleep(.4)"
        )
        result = subprocess.run(  # noqa: S603 -- fixed owned child
            [sys.executable, "-c", code], cwd=root, capture_output=True, timeout=5
        )
        self.assertEqual(result.returncode, 0, result.stderr)


if __name__ == "__main__":
    unittest.main()
