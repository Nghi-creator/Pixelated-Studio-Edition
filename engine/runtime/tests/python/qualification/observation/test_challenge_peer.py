"""Generation-bound command/ack protocol over the synthetic joint lifecycle."""

import json
import unittest
from copy import deepcopy

from research.physical_challenges.peer import ChallengeEndpoint, command, encode

from qualification.observation import test_physical_challenge_lifecycle as fixtures


class PeerTests(unittest.TestCase):
    def setUp(self):
        self.fixture = fixtures.LifecycleTests("test_closed_controller_cannot_be_restarted")
        self.controller = self.fixture.make()
        self.addCleanup(self.fixture.doCleanups)
        self.peer = ChallengeEndpoint(self.controller, "mixed_delay_pressure", "a" * 64)

    def send(self, operation):
        request = command(
            self.peer.generation,
            self.peer.recipe,
            self.peer.channel_id,
            self.peer.sequence + 1,
            operation,
        )
        return self.peer.execute(encode(request))

    def complete(self):
        rows = []
        for op in (
            "start",
            "begin_degraded",
            "end_degraded",
            "prepare_relief",
            "dispatch_relief",
            "begin_relief",
            "end_relief",
            "begin_recovery",
            "end_recovery",
            "close",
        ):
            if op == "begin_degraded":
                self.fixture.clock.advance(1)
            if op.startswith("end_"):
                self.fixture.clock.advance(3.2)
            rows.append(self.send(op))
        return rows

    def test_complete_sequence_retains_hashed_ack_and_lifecycle_prefix(self):
        rows = self.complete()
        self.assertTrue(all(r["status"] == "completed" for r in rows))
        self.assertEqual(rows[-1]["snapshot"]["state"], "closed")
        self.assertEqual(rows[-1]["events"][-1]["kind"], "cleanup")
        self.assertEqual(rows[-1]["command_sequence"], 10)
        self.assertEqual(self.fixture.value, 0)

    def test_replay_foreign_binding_and_noncanonical_requests_never_execute(self):
        good = command(self.peer.generation, self.peer.recipe, self.peer.channel_id, 1, "start")
        bad = []
        for field, value in [
            ("sequence", True),
            ("sequence", 2),
            ("channel_id", "b" * 64),
            ("recipe", "owned_cpu_pressure"),
            ("operation", "set_property"),
        ]:
            value_dict = deepcopy(good)
            value_dict[field] = value
            bad.append(encode(value_dict))
        altered = deepcopy(good)
        altered["generation"]["peer"] = "foreign"
        bad.append(encode(altered))
        bad.append(encode(good)[:-1] + b',"sequence":1}')
        bad.append(encode({**good, "extra": True}))
        for raw in bad:
            with self.subTest(raw=raw[:40]):
                with self.assertRaises(ValueError):
                    self.peer.execute(raw)
                self.assertEqual(self.peer.sequence, 0)
                self.assertEqual(self.fixture.writes, [])
        self.peer.execute(encode(good))
        with self.assertRaises(ValueError):
            self.peer.execute(encode(good))
        self.controller.close()

    def test_valid_but_out_of_order_operation_has_failed_ack_and_cleanup(self):
        ack = self.send("begin_relief")
        self.assertEqual(ack["status"], "failed")
        self.assertEqual(ack["command_sequence"], 1)
        self.assertTrue(self.controller.failed)
        self.assertEqual(self.fixture.value, 0)

    def test_snapshot_does_not_restart_condition_or_report_a_cadence_ack(self):
        self.send("start")
        first = self.peer.snapshot()
        self.fixture.clock.advance(0.2)
        second = self.peer.snapshot()
        self.assertEqual(first["condition_deadline_ns"], second["condition_deadline_ns"])
        self.assertGreater(second["observed_ns"], first["observed_ns"])
        self.assertFalse(second["cadence_application_verified"])
        self.controller.close()

    def test_request_bytes_are_part_of_ack_identity(self):
        from hashlib import sha256

        raw = encode(
            command(self.peer.generation, self.peer.recipe, self.peer.channel_id, 1, "start")
        )
        ack = self.peer.execute(raw)
        self.assertEqual(ack["command_sha256"], "sha256:" + sha256(raw).hexdigest())
        self.assertEqual(json.loads(encode(ack))["snapshot"]["recipe"], "mixed_delay_pressure")
        self.controller.close()


if __name__ == "__main__":
    unittest.main()
