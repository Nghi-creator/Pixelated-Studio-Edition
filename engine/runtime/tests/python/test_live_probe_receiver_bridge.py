"""Relay identity/worker scope and original host receipt freshness are preserved."""

import copy
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
import test_live_probe_local_owner as fixtures
from live_probe_control.receiver_bridge import (
    BrowserReceiverBridge,
    observation_enabled,
    valid_report,
)


class ReceiverBridgeTests(unittest.TestCase):
    def setUp(self):
        self.fixture = fixtures.LocalOwnerTests()
        self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)
        self.fixture.ready()
        self.local, self.owner = self.fixture.scope, self.fixture.owner
        self.local.unbind(self.owner, self.fixture.receiver)
        self.service = self.fixture.service
        self.service.maximum = 2
        self.bridge = BrowserReceiverBridge(
            self.service, clock=lambda: self.fixture.now
        )
        self.challenge = self.bridge.open("peer")
        self.bound = dict(self.challenge, receiverSocketId="socket_1")
        self.assertTrue(self.bridge.bound(self.bound))

    def report(self, sequence=0, **changes):
        return dict(
            self.bound,
            sequence=sequence,
            clockId="browser",
            elapsedNs=sequence * 250000000,
            framesDecoded=10 + sequence * 10,
            presentedFrames=10 + sequence * 10,
            **changes,
        )

    def advance(self, sequence):
        self.fixture.now += 250000000
        self.fixture.slot.seen_ns = self.fixture.now
        self.fixture.slot.owner.last_observation = (
            fixtures.native(sequence * 100 + 1, 20 + sequence * 10),
            self.fixture.now,
            sequence + 2,
        )

    def test_gate_defaults_off_and_requires_dedicated_workers(self):
        self.assertFalse(observation_enabled({}, None))
        for environment in (
            {"PIXELATED_RECEIVER_OBSERVATIONS": "1"},
            {"PIXELATED_RECEIVER_OBSERVATIONS": "true"},
        ):
            with self.assertRaises(ValueError):
                observation_enabled(environment, None)
        self.assertTrue(
            observation_enabled({"PIXELATED_RECEIVER_OBSERVATIONS": "1"}, self.service)
        )

    def test_closed_payload_never_accepts_target_or_host_receipt(self):
        sample = self.report()
        self.assertTrue(valid_report(sample))
        for extra in ({"targetFps": 24}, {"receivedNs": 1}, {"framesDecoded": True}):
            self.assertFalse(valid_report(sample | extra))

    def test_attach_does_not_replay_buffered_observations_as_fresh(self):
        self.assertTrue(self.bridge.accept(self.report(), self.fixture.now))
        receiver = self.bridge.attach(self.local, self.owner, "peer", "token")
        self.assertEqual(len(self.local.bindings[receiver].browser), 0)
        self.advance(1)
        self.assertTrue(self.bridge.accept(self.report(1), self.fixture.now))
        self.assertEqual(self.local.bindings[receiver].browser[0][0].sequence, 0)
        self.assertEqual(
            self.local.inspect(receiver)["status"], "insufficient_or_stale"
        )
        self.advance(2)
        self.assertTrue(self.bridge.accept(self.report(2), self.fixture.now))
        self.assertEqual(self.local.inspect(receiver)["status"], "ready_for_dry_run")
        self.assertFalse(self.local.inspect(receiver)["live_authority"])

    def test_foreign_nonce_hash_or_socket_cannot_poison_valid_binding(self):
        for fields in (
            {"bindingId": "b" * 64},
            {"offerHash": "b" * 64},
            {"receiverSocketId": "other"},
        ):
            self.assertFalse(
                self.bridge.accept(self.report() | fields, self.fixture.now)
            )
        self.assertTrue(self.bridge.accept(self.report(), self.fixture.now))

    def test_replay_clock_reset_and_counter_reset_invalidate_attached_handle(self):
        receiver = self.bridge.attach(self.local, self.owner, "peer", "token")
        self.assertTrue(self.bridge.accept(self.report(), self.fixture.now))
        self.assertFalse(self.bridge.accept(self.report(), self.fixture.now))
        with self.assertRaises(ValueError):
            self.local.inspect(receiver)

    def test_main_loop_backlog_cannot_restamp_stale_browser_progress(self):
        receiver = self.bridge.attach(self.local, self.owner, "peer", "token")
        receipt = self.fixture.now
        self.fixture.now += 750000001
        self.assertFalse(self.bridge.accept(self.report(), receipt))
        self.assertNotIn(receiver, self.local.bindings)

    def test_socket_change_requires_new_challenge(self):
        self.assertFalse(self.bridge.bound(self.bound | {"receiverSocketId": "other"}))
        self.assertFalse(self.bridge.accept(self.report(), self.fixture.now))
        fresh = self.bridge.open("peer")
        self.assertNotEqual(fresh["bindingId"], self.challenge["bindingId"])

    def test_replacement_and_retirement_do_not_reuse_receiver_capability(self):
        receiver = self.bridge.attach(self.local, self.owner, "peer", "token")
        old = self.fixture.slot
        replacement = copy.copy(old)
        replacement.token = "replacement"
        self.service.active["peer"] = replacement
        fresh = self.bridge.open("peer")
        self.assertNotEqual(fresh["bindingId"], self.challenge["bindingId"])
        self.assertFalse(self.bridge.accept(self.report(), self.fixture.now))
        with self.assertRaises(ValueError):
            self.local.inspect(receiver)
        self.bridge.retire("peer")
        self.assertEqual(self.bridge.records, {})


if __name__ == "__main__":
    unittest.main()
