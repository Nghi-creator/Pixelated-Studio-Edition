"""Closed launch routing, trace mapping and nonblocking service; no native media."""

import threading
import unittest
from unittest.mock import Mock

from research.physical_challenges.channel import ChallengeFileService
from research.physical_challenges.lifecycle import RECIPES
from research.physical_challenges.modes import physical_challenge_mode
from research.physical_challenges.peer import command, encode
from research.physical_challenges.trace import ChallengeEncodedPhaseTrace
from research.resource_observation.modes import condition_mode

from qualification.observation import test_challenge_channel as fixtures


class AcquisitionTests(unittest.TestCase):
    def test_new_and_fixed_selectors_have_disjoint_exact_namespaces(self):
        for name in RECIPES:
            mode = "engineering-n11-physical-challenge-" + name
            self.assertEqual(physical_challenge_mode(mode), name)
            self.assertIsNone(condition_mode(mode))
        for name in (
            True,
            0,
            "owned_cpu_pressure",
            "engineering-n11-physical-challenge-mixed_delay_pressure;anything",
        ):
            self.assertIsNone(physical_challenge_mode(name))

    def test_challenge_references_bind_trace_without_renaming_emitted_evidence(self):
        emit = Mock()
        trace = ChallengeEncodedPhaseTrace(emit)
        for phase, start in (("healthy", 0), ("post", 20_000_000_000)):
            trace.observe(
                "n11_challenge_reference",
                phase=phase,
                samples=[{"at_ns": start}, {"at_ns": start + 3_200_000_000}],
            )
        self.assertEqual(trace.boundaries["post", "start"], 20_000_000_000)
        self.assertEqual(emit.call_args.args[0], "n11_challenge_reference")
        with self.assertRaises(ValueError):
            trace.observe(
                "n11_challenge_reference", phase="post", samples=[{"at_ns": 1}, {"at_ns": 2}]
            )

    def test_slow_activation_does_not_block_main_poll_or_publish_a_premature_ack(self):
        helper = fixtures.ChannelTests("test_files_execute_complete_request_ack_transcript")
        handle, anchor = helper.make()
        self.addCleanup(helper.doCleanups)
        old = helper.service
        endpoint = old.endpoint
        entered, release, returned = threading.Event(), threading.Event(), threading.Event()
        original = helper.fixture.pressure.start

        def delayed():
            entered.set()
            if not release.wait(2):
                raise ValueError("test activation stalled")
            return original()

        helper.fixture.pressure.start = delayed
        service = ChallengeFileService(
            endpoint, anchor, clock=helper.fixture.clock, asynchronous=True
        )
        self.addCleanup(service.close)
        anchor.write(
            "n11-challenge-command-01.json",
            encode(command(endpoint.generation, endpoint.recipe, endpoint.channel_id, 1, "start")),
        )
        caller = threading.Thread(target=lambda: (service.poll(), returned.set()))
        try:
            caller.start()
            self.assertTrue(entered.wait(1))
            self.assertTrue(returned.wait(1))
            service.poll()
            with self.assertRaises(FileNotFoundError):
                anchor.read("n11-challenge-ack-01.json", 262144)
        finally:
            release.set()
            caller.join(2)
            if service.pending is not None:
                service.pending.result(timeout=2)
        service.poll()
        self.assertIn(b'"completed"', anchor.read("n11-challenge-ack-01.json", 262144))


if __name__ == "__main__":
    unittest.main()
