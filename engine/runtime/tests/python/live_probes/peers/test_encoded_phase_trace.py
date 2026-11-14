"""Same-clock phase binding and trace IPC regression cases."""

import copy
import unittest

from research.live_probe_control.control.contracts import Generation
from research.live_probe_control.peers.peer_protocol import (
    command,
    decode,
    encode,
    event,
)
from research.live_probe_control.peers.peer_supervisor import PeerSupervisor
from research.resource_observation.encoded_phase_trace import PHASES, EncodedPhaseTrace

GENERATION = Generation("owner", "pipeline", "peer")
NS = "time:[123]"


class EncodedPhaseTraceTests(unittest.TestCase):
    def setUp(self):
        self.trace = EncodedPhaseTrace(lambda *_args, **_kwargs: None)
        for i, phase in enumerate(PHASES):
            start = 1000 + i * 100
            if phase in ("healthy", "post"):
                self.trace.observe(
                    "n11_pacing_reference",
                    phase=phase,
                    samples=[{"at_ns": start}, {"at_ns": start + 50}],
                )
            else:
                self.trace.observe("n11_pair_phase_started", phase=phase, at_ns=start)
                self.trace.observe(
                    "n11_pair_phase_completed", phase=phase, at_ns=start + 50
                )
        self.reply = {
            "origin_ns": 500,
            "time_namespace": NS,
            "observed": 2,
            "buffer_list": False,
            "rows": [[1, 850, 851], [2, 1200, 1201]],
            "identity_read": {
                "start_ns": 1300,
                "end_ns": 1301,
                "count": 2,
                "observed_before": 2,
                "observed_after": 2,
            },
        }

    def report(self, namespace=NS):
        return self.trace.report(
            self.reply,
            generation=GENERATION,
            controller_origin_ns=300,
            controller_namespace=namespace,
        )

    def test_same_clock_boundaries_and_count_check(self):
        result = self.report()
        self.assertEqual(result["state"], "count_reconciled")
        self.assertEqual(
            result["windows"]["healthy"], {"phase_start_ns": 800, "phase_end_ns": 850}
        )
        self.assertEqual(
            result["windows"]["post"], {"phase_start_ns": 1200, "phase_end_ns": 1250}
        )

    def test_namespace_mismatch_and_unsettled_count_disable_windows(self):
        self.assertEqual(
            self.report("time:[124]")["reason_codes"], ["time_namespace_mismatch"]
        )
        self.reply["identity_read"]["observed_before"] = 1
        result = self.report()
        self.assertEqual(result["reason_codes"], ["identity_prefix_not_reconciled"])
        self.assertEqual(result["windows"], {})

    def test_reply_must_be_bound_to_one_outstanding_request(self):
        owner = PeerSupervisor(generation=GENERATION, clock=lambda: 1)
        owner.state = "playing"
        with self.assertRaises(ValueError):
            owner.request_encoded_trace()
        owner.encoded_trace_enabled = True
        owner.request_encoded_trace()
        request = command(GENERATION, 0, "encoded_trace", {})
        response = decode(encode(event(request, "encoded_trace", self.reply)).strip())
        owner._event(response, 2)
        self.assertEqual(owner.encoded_trace_reply, self.reply)
        with self.assertRaises(ValueError):
            owner._event(response, 2)
        with self.assertRaises(ValueError):
            owner.request_encoded_trace()

    def test_malformed_ordinals_rejected(self):
        bad = copy.deepcopy(self.reply)
        bad["rows"][1][0] = 3
        with self.assertRaises(ValueError):
            event(command(GENERATION, 0, "encoded_trace", {}), "encoded_trace", bad)
