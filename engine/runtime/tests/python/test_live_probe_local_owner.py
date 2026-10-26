"""Local admission is read-only; forged/stale claims cannot grant action authority."""

import copy
import os
import shutil
import sys
import tempfile
import threading
import unittest
from dataclasses import asdict, replace
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from live_probe_control.contracts import Generation, Policy, Request, Snapshot, digest
from live_probe_control.journal import CadenceJournal
from live_probe_control.local_owner import (
    LocalProbeOwner,
    OwnerCapability,
    ReceiverCapability,
    ReceiverSample,
)
from live_probe_control.peer_protocol import SNAPSHOT_COUNTERS

SECOND = 10**9
POLICY = Policy(24, 60, 2 * SECOND, 3, 12 * SECOND, SECOND, 20, 100000000)
GEN = Generation("owner", "pipeline", "peer")
PROFILE = {"id": "balanced", "fps": 30, "bitrate_kbps": 1500}


def native(stamp=1, count=10, **changes):
    body = dict.fromkeys(SNAPSHOT_COUNTERS, 0)
    body.update(
        read_start_ns=stamp,
        read_end_ns=stamp + 1,
        state="playing",
        connection_state="connected",
        ice_connection_state="completed",
        capture_buffers=count,
        encoded_buffers=count,
        configured_fps=30,
        negotiated_fps=30,
        width=640,
        height=480,
        target_bitrate=1500000,
        cpu_used=6,
        max_quantizer=48,
    )
    body.update(changes)
    return body


class LocalOwnerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.now = 10 * SECOND
        self.slot = SimpleNamespace(
            token="token",
            sdp="offer",
            seen_ns=self.now,
            stop=threading.Event(),
            done=threading.Event(),
            failure=None,
            owner=SimpleNamespace(
                generation=GEN, state="playing", last_observation=None
            ),
        )
        self.service = SimpleNamespace(
            active={"peer": self.slot}, closed=False, profile=PROFILE
        )
        self.scope = LocalProbeOwner(
            self.service, self.temp.name, POLICY, enabled=True, clock=lambda: self.now
        )
        self.scope.__enter__()
        self.addCleanup(self.scope.close)
        self.owner = self.scope.claim()
        self.receiver = self.scope.bind(self.owner, "peer", "token")

    def observe(self, seq, count, *, advance=250000000, **changes):
        if seq:
            self.now += advance
        self.slot.seen_ns = self.now
        self.slot.owner.last_observation = (
            native(seq * 10 + 1, count, **changes),
            self.now,
            seq + 1,
        )
        self.scope.report(
            self.receiver, ReceiverSample(seq, "browser", seq * 250000000, count, count)
        )

    def ready(self):
        self.observe(0, 10)
        self.observe(1, 20)
        self.assertEqual(
            self.scope.inspect(self.receiver)["status"], "ready_for_dry_run"
        )

    def draft(self, **changes):
        args = {"request_id": "request", "target_fps": 24, "duration_ns": SECOND}
        args.update(changes)
        return self.scope.prepare(self.owner, self.receiver, **args)

    def test_disabled_scope_does_not_open_ledger(self):
        path = Path(self.temp.name) / "absent"
        with self.assertRaises(ValueError):
            LocalProbeOwner(self.service, path, POLICY).__enter__()
        self.assertFalse(path.exists())

    def test_native_connection_and_browser_progress_both_required(self):
        self.assertEqual(
            self.scope.inspect(self.receiver)["status"], "insufficient_or_stale"
        )
        self.observe(0, 10, connection_state="connecting")
        self.observe(1, 20)
        self.assertEqual(
            self.scope.inspect(self.receiver)["status"], "insufficient_or_stale"
        )
        self.observe(2, 30)
        self.assertEqual(
            self.scope.inspect(self.receiver)["status"], "ready_for_dry_run"
        )

    def test_preparation_is_bound_read_only_and_has_no_authority(self):
        self.ready()
        before = sorted(p.name for p in Path(self.temp.name).iterdir())
        draft = self.draft()
        self.assertEqual(draft.request.generation, GEN)
        self.assertEqual(draft.request_hash, digest(asdict(draft.request)))
        self.assertFalse(draft.live_authority)
        self.assertFalse(draft.dispatch_available)
        self.assertFalse(draft.budget_reserved)
        self.assertEqual(before, sorted(p.name for p in Path(self.temp.name).iterdir()))
        self.assertFalse((Path(self.temp.name) / "journal.json").exists())
        self.assertIs(self.scope.recheck(self.owner, draft), draft)

    def test_receiver_and_serialized_claims_cannot_prepare(self):
        self.ready()
        for handle in (self.receiver, OwnerCapability(), {}, "token", None):
            with self.subTest(handle=type(handle)), self.assertRaises(ValueError):
                self.scope.prepare(handle, self.receiver, "request", 24, SECOND)
        for handle in (ReceiverCapability(), {}, "token", self.owner):
            with self.assertRaises(ValueError):
                self.scope.report(handle, ReceiverSample(0, "browser", 0, 1, 1))

    def test_cloned_draft_is_not_issued_object(self):
        self.ready()
        draft = self.draft()
        with self.assertRaises(ValueError):
            self.scope.recheck(self.owner, replace(draft))

    def test_draft_fields_cannot_claim_dispatch_or_reserved_budget(self):
        self.ready()
        draft = self.draft()
        for key in ("dispatch_available", "budget_reserved", "live_authority"):
            with self.assertRaises(ValueError):
                replace(draft, **{key: True})

    def test_ledger_directory_replacement_does_not_reset_scope(self):
        self.ready()
        backup = self.temp.name + "-moved"
        os.rename(self.temp.name, backup)
        self.addCleanup(shutil.rmtree, backup)
        os.mkdir(self.temp.name, 0o700)
        with self.assertRaisesRegex(ValueError, "replaced"):
            self.draft()

    def test_duplicate_request_does_not_allocate_or_rebind(self):
        self.ready()
        draft = self.draft()
        self.assertIs(self.draft(), draft)
        with self.assertRaises(ValueError):
            self.draft(duration_ns=2 * SECOND)
        self.assertEqual(len(self.scope.drafts), 1)

    def test_draft_and_browser_freshness_expire(self):
        self.ready()
        draft = self.draft()
        self.now += 250000001
        with self.assertRaises(ValueError):
            self.scope.recheck(self.owner, draft)
        self.now += SECOND
        self.assertEqual(
            self.scope.inspect(self.receiver)["status"], "insufficient_or_stale"
        )
        with self.assertRaises(ValueError):
            self.draft(request_id="another")

    def test_wrong_profile_dimensions_or_changed_settings_invalidate(self):
        for changes in (
            {"width": 1280},
            {"target_bitrate": 1600000},
            {"cpu_used": 8},
            {"negotiated_fps": 24},
        ):
            with self.subTest(changes=changes):
                binding = self.scope.bindings[self.receiver]
                binding.invalid = False
                self.slot.owner.last_observation = (native(**changes), self.now, 1)
                with self.assertRaises(ValueError):
                    self.scope.inspect(self.receiver)
                self.assertTrue(binding.invalid)

    def test_native_counter_reset_survives_missing_interior_sample(self):
        self.observe(0, 20)
        self.observe(1, 30, capture_buffers=None)
        with self.assertRaises(ValueError):
            self.observe(2, 10)
        with self.assertRaises(ValueError):
            self.scope.inspect(self.receiver)

    def test_native_duplicate_cannot_fabricate_progress(self):
        self.observe(0, 10)
        self.now += 250000000
        self.scope.report(
            self.receiver, ReceiverSample(1, "browser", 250000000, 20, 20)
        )
        self.assertEqual(
            self.scope.inspect(self.receiver)["status"], "insufficient_or_stale"
        )

    def test_worker_publication_during_api_call_is_fenced_after_atomic_read(self):
        self.ready()
        fixture = self

        class ConcurrentOwner:
            generation = GEN
            state = "playing"

            @property
            def last_observation(self):
                fixture.now += 1
                return native(100, 30), fixture.now, 3

        self.slot.owner = ConcurrentOwner()
        self.assertEqual(
            self.scope.inspect(self.receiver)["status"], "ready_for_dry_run"
        )

    def test_future_receipt_and_reversed_native_time_invalidate(self):
        self.slot.owner.last_observation = (native(), self.now + 1, 1)
        with self.assertRaises(ValueError):
            self.scope.inspect(self.receiver)

    def test_browser_replay_gap_reset_and_clock_replacement_invalidate(self):
        for sample in (
            ReceiverSample(0, "browser", 1, 2, 2),
            ReceiverSample(2, "browser", 1, 2, 2),
            ReceiverSample(1, "other", 1, 2, 2),
            ReceiverSample(1, "browser", 1, 0, 0),
        ):
            with self.subTest(sample=sample):
                binding = self.scope.bindings[self.receiver]
                binding.invalid = False
                binding.browser.clear()
                self.scope.report(self.receiver, ReceiverSample(0, "browser", 0, 1, 1))
                self.now += 250000000
                with self.assertRaises(ValueError):
                    self.scope.report(self.receiver, sample)

    def test_missing_browser_progress_expires_despite_fresh_reports(self):
        self.ready()
        for sequence in range(2, 6):
            self.now += 250000000
            self.slot.seen_ns = self.now
            self.scope.report(
                self.receiver,
                ReceiverSample(sequence, "browser", sequence * 250000000, 20, 20),
            )
        self.assertEqual(
            self.scope.inspect(self.receiver)["status"], "insufficient_or_stale"
        )

    def test_replacement_stop_generation_and_signaling_lease_invalidate(self):
        self.ready()
        draft = self.draft()
        original = self.slot
        replacement = copy.copy(original)
        replacement.token = "replacement"
        self.service.active["peer"] = replacement
        with self.assertRaises(ValueError):
            self.scope.recheck(self.owner, draft)
        # Replacement uses the same owner/session ledger, never a remote-ID path.
        replacement.owner = SimpleNamespace(
            generation=Generation("owner", "new", "peer"),
            state="playing",
            last_observation=None,
        )
        receiver = self.scope.bind(self.owner, "peer", "replacement")
        self.assertIsNot(receiver, self.receiver)
        self.assertEqual(self.scope.directory, self.temp.name)
        replacement.stop.set()
        with self.assertRaises(ValueError):
            self.scope.inspect(receiver)

    def test_owner_clock_regression_closes_capabilities(self):
        self.ready()
        self.now -= SECOND
        with self.assertRaises(ValueError):
            self.scope.inspect(self.receiver)
        self.assertTrue(self.scope.closed)
        with self.assertRaises(ValueError):
            self.scope.claim()

    def test_policy_replacement_cannot_reuse_issued_draft(self):
        self.ready()
        draft = self.draft()
        self.scope.policy = replace(POLICY, maximum_actions=2)
        with self.assertRaisesRegex(ValueError, "policy changed"):
            self.scope.recheck(self.owner, draft)

    def test_closed_owner_cannot_be_reentered(self):
        self.scope.close()
        with self.assertRaises(ValueError):
            self.scope.__enter__()

    def test_policy_limits_apply_before_draft(self):
        self.ready()
        for changes in (
            {"target_fps": True},
            {"target_fps": 23},
            {"target_fps": 30},
            {"duration_ns": 100000000},
            {"duration_ns": 3 * SECOND},
        ):
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                self.draft(**changes)

    def test_private_directory_and_journal_lock_are_reused(self):
        self.ready()
        with CadenceJournal(self.temp.name), self.assertRaises(BlockingIOError):
            self.draft()
        os.chmod(self.temp.name, 0o755)
        self.addCleanup(os.chmod, self.temp.name, 0o700)
        with self.assertRaises(ValueError):
            self.draft()

    def test_draft_capacity_is_bounded_without_reserving_budget(self):
        self.ready()
        for index in range(64):
            self.draft(request_id=f"request-{index}")
        with self.assertRaises(ValueError):
            self.draft(request_id="overflow")
        self.assertFalse((Path(self.temp.name) / "journal.json").exists())

    def ledger(self, *, active=False, policy=POLICY):
        request = Request("reserved", GEN, 24, SECOND)
        row = {
            "request": asdict(request),
            "request_hash": digest(asdict(request)),
            "prior": asdict(Snapshot(GEN, 30, 30, "a" * 64, True)),
            "process": {
                "boot": "00000000-0000-0000-0000-000000000001",
                "pid": 123,
                "start": "100",
            },
            "reserved_ns": 3 * SECOND,
            "result": None,
            "failure": None,
        }
        ledger = {
            "version": "n10-cadence-journal-v1",
            "policy_hash": digest(asdict(policy)),
            "state": "active" if active else "clean",
            "actions": int(active),
            "reserved_ns": 3 * SECOND if active else 0,
            "cooldown_until_ns": 0,
            "clock_boot": "00000000-0000-0000-0000-000000000001",
            "active": "reserved" if active else None,
            "history": [row] if active else [],
        }
        with CadenceJournal(self.temp.name) as store:
            store.save(ledger)
        return (Path(self.temp.name) / "journal.json").read_bytes()

    def test_dirty_reservation_blocks_draft_without_erasing_or_refunding(self):
        self.ready()
        draft = self.draft()
        before = self.ledger(active=True)
        with self.assertRaises(ValueError):
            self.scope.recheck(self.owner, draft)
        with self.assertRaises(ValueError):
            self.draft(request_id="different")
        self.assertEqual((Path(self.temp.name) / "journal.json").read_bytes(), before)
        with LocalProbeOwner(
            self.service, self.temp.name, POLICY, enabled=True
        ) as restarted:
            self.assertEqual(restarted.directory, self.scope.directory)
        self.assertEqual((Path(self.temp.name) / "journal.json").read_bytes(), before)

    def test_persisted_policy_cannot_be_replaced_by_new_owner_scope(self):
        self.ready()
        changed = replace(POLICY, maximum_actions=2)
        before = self.ledger(policy=changed)
        with self.assertRaises(ValueError):
            self.draft()
        with self.assertRaises(ValueError):
            LocalProbeOwner(
                self.service, self.temp.name, POLICY, enabled=True
            ).__enter__()
        self.assertEqual((Path(self.temp.name) / "journal.json").read_bytes(), before)

    def test_skipped_native_observation_cannot_hide_interior_reset(self):
        self.observe(0, 10)
        self.now += 250000000
        self.slot.owner.last_observation = (native(100, 30), self.now, 3)
        with self.assertRaises(ValueError):
            self.scope.inspect(self.receiver)

    def test_same_native_stamp_cannot_be_rewritten(self):
        self.observe(0, 10)
        self.slot.owner.last_observation = (native(1, 11), self.now, 1)
        with self.assertRaises(ValueError):
            self.scope.inspect(self.receiver)

    def test_native_clock_reversal_invalidate_binding(self):
        self.observe(0, 10)
        self.now += 250000000
        self.slot.owner.last_observation = (native(0, 20), self.now, 2)
        with self.assertRaises(ValueError):
            self.scope.inspect(self.receiver)

    def test_stale_main_loop_lease_cannot_be_replaced_by_browser_claim(self):
        self.ready()
        self.now += 3000000001
        with self.assertRaises(ValueError):
            self.scope.report(
                self.receiver, ReceiverSample(2, "browser", 500000000, 30, 30)
            )
        self.slot.seen_ns = self.now
        with self.assertRaises(ValueError):
            self.scope.inspect(self.receiver)

    def test_samples_require_exact_integers(self):
        for fields in (
            {"sequence": True},
            {"elapsed_ns": -1},
            {"frames_decoded": None},
            {"presented_frames": 2**53},
        ):
            args = {
                "sequence": 0,
                "clock_id": "browser",
                "elapsed_ns": 0,
                "frames_decoded": 0,
                "presented_frames": 0,
            }
            with self.assertRaises(ValueError):
                ReceiverSample(**(args | fields))


if __name__ == "__main__":
    unittest.main()
