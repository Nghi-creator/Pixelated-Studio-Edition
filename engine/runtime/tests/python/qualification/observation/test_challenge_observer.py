"""Observer ordering/clock seams without native media, collection or label acceptance."""

import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

from research.live_probe_control.control.contracts import Generation
from research.physical_challenges.observer import ChallengeObservation, _DispatchBoundary
from research.resource_observation.contained_condition import ResourceConditionObservation
from scripts.research.n11.native.paired_observation import PairedObservation


class ObserverTests(unittest.TestCase):
    def make(self):
        def base(o):
            o.local = Mock()
            o.origin = 1000
            o.now = Mock(return_value=2000)
            o.emit = Mock()

        with patch.object(PairedObservation, "__init__", base):
            o = ChallengeObservation(recipe="delay_to_pressure", sampler_factory=Mock())
        o.pacer = Mock()
        o.pacer.send.return_value = {"status": "completed"}
        return o

    def test_degraded_transition_and_establishment_precede_actual_cadence_dispatch(self):
        o = self.make()
        order = []
        o.pacer.send.side_effect = lambda op: order.append(op) or {"status": "completed"}
        o.pacer.poll_snapshot.side_effect = lambda **k: (
            order.append("established") or {"observed_ns": 2, "ready_not_before_ns": 2}
        )
        real = Mock()
        real.dispatch.side_effect = lambda *a, **k: order.append("real_dispatch")
        o.local = _DispatchBoundary(real, o)
        o.phase_boundary("after_end", "degraded")
        o.local.dispatch("capability", "draft")
        self.assertEqual(
            order,
            ["end_degraded", "prepare_relief", "established", "dispatch_relief", "real_dispatch"],
        )
        real.dispatch.assert_called_once_with("capability", "draft")

    def test_failed_establishment_never_dispatches_cadence(self):
        o = self.make()
        o.pacer.poll_snapshot.side_effect = ValueError("not ready")
        with self.assertRaises(ValueError):
            o.phase_boundary("after_end", "degraded")
        self.assertNotIn("dispatch_relief", [c.args[0] for c in o.pacer.send.call_args_list])

    def test_establishment_yields_without_waiting_for_a_fresh_worker_report(self):
        o = self.make()
        o.challenge_stage = "establish"
        o.pacer.sample.side_effect = AssertionError("blocking fresh sample must not run")
        o.pacer.poll_snapshot.return_value = None
        with patch.object(PairedObservation, "tick", return_value=False) as parent:
            for _ in range(40):
                self.assertFalse(o.tick())
            parent.assert_not_called()
            o.pacer.poll_snapshot.return_value = {"observed_ns": 2, "ready_not_before_ns": 2}
            self.assertFalse(o.tick())
            parent.assert_called_once()
        o.pacer.sample.assert_not_called()

    def test_transition_wait_yields_and_consumes_end_and_prepare_commands_once(self):
        o = self.make()
        o.pacer.wait_established.side_effect = AssertionError("no blocking establishment loop")
        o.pacer.poll_snapshot.side_effect = [
            None,
            {"observed_ns": 1, "ready_not_before_ns": 2},
            {"observed_ns": 2, "ready_not_before_ns": 2},
        ]
        self.assertFalse(o.phase_boundary("after_end", "degraded"))
        self.assertFalse(o.phase_boundary("after_end", "degraded"))
        self.assertTrue(o.phase_boundary("after_end", "degraded"))
        self.assertEqual(
            [c.args[0] for c in o.pacer.send.call_args_list], ["end_degraded", "prepare_relief"]
        )
        o.pacer.wait_established.assert_not_called()

    def test_independent_cpu_sampler_is_lazy_and_keeps_controller_clock(self):
        o = self.make()
        o.sampler_factory.assert_not_called()
        sampler = Mock()
        sampler.sample.return_value = {"cpu": "sample"}
        o.sampler_factory.return_value = sampler
        slot = SimpleNamespace(
            owner=SimpleNamespace(generation=Generation("owner", "pipeline", "peer"))
        )
        result = o.native_read_evidence(
            slot,
            dict(
                read_start_ns=1,
                read_end_ns=2,
                encoded_buffers=10,
                encoded_counter_read=dict(
                    method="native-encoded-counter-read-brackets-v1",
                    read_start_ns=1,
                    read_end_ns=2,
                    value=10,
                ),
            ),
        )
        self.assertEqual(result["container_cpu_read"], {"cpu": "sample", "phase": "healthy"})
        self.assertEqual(o.sampler_factory.call_args.kwargs["clock"](), 1000)
        self.assertNotEqual(
            o.sampler_factory.call_args.kwargs["clock_id"], result["native_read"]["clock_id"]
        )
        slot.owner.generation = Generation("owner", "replacement", "peer")
        with self.assertRaises(ValueError):
            o.native_read_evidence(slot, dict(read_start_ns=3, read_end_ns=4))

    def test_phase_tags_and_encoded_reads_are_preserved_or_rejected(self):
        o = self.make()
        o.sampler_factory.return_value.sample.return_value = {}
        slot = SimpleNamespace(
            owner=SimpleNamespace(generation=Generation("owner", "pipeline", "peer"))
        )
        body = dict(
            read_start_ns=1,
            read_end_ns=2,
            encoded_buffers=10,
            encoded_counter_read=dict(
                method="native-encoded-counter-read-brackets-v1",
                read_start_ns=1,
                read_end_ns=2,
                value=10,
            ),
        )
        for phase in ("healthy", "degraded", "relief", "recovery", "post"):
            o.challenge_stage = phase if phase in ("healthy", "post") else "pair"
            o.stage, o.phase = "measure", phase
            result = o.native_read_evidence(slot, body)
            self.assertEqual(result["container_cpu_read"]["phase"], phase)
            self.assertEqual(
                result["encoded_counter_read"]["clock_id"], result["native_read"]["clock_id"]
            )
            self.assertEqual(result["encoded_counter_read"]["value"], 10)
        for bad in (
            {k: v for k, v in body.items() if k != "encoded_counter_read"},
            {**body, "encoded_counter_read": {**body["encoded_counter_read"], "value": 11}},
        ):
            with self.assertRaises(ValueError):
                o.native_read_evidence(slot, bad)
        o.challenge_stage, o.stage = "pair", "prime"
        with self.assertRaises(ValueError):
            o.native_read_evidence(slot, body)

    def test_checkpoint_retains_failed_transcript_before_parent_checkpoint(self):
        o = self.make()
        o.pacer.send.side_effect = ValueError("cleanup unconfirmed")
        with patch.object(PairedObservation, "checkpoint") as parent:
            with self.assertRaises(ValueError):
                o.checkpoint()
            parent.assert_called_once()
        self.assertIn(
            "n11_challenge_command_transcript", [c.args[0] for c in o.emit.call_args_list]
        )

    def test_reference_requires_actual_cpu_and_native_read_spans(self):
        o = self.make()

        def row(at, start, end):
            return {
                "at_ns": at,
                **{
                    k: {"clock_id": k, "read_start_ns": start, "read_end_ns": end}
                    for k in ("native_read", "container_cpu_read")
                },
            }

        rows = [
            row(i * 1_100_000_000, i * 1_100_000_000, i * 1_100_000_000 + 100_000_000)
            for i in range(4)
        ]
        self.assertTrue(ResourceConditionObservation._reference_read_spans_ready(o, rows))
        rows[-1]["native_read"]["read_start_ns"] -= 1
        self.assertFalse(ResourceConditionObservation._reference_read_spans_ready(o, rows))


if __name__ == "__main__":
    unittest.main()
