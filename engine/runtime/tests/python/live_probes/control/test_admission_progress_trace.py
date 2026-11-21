"""Admission diagnostics observe existing reads without changing health decisions."""

import copy
import sys
import threading
import unittest
from collections import deque
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[4]))
from live_probes.control import test_live_probe_controller as fixtures
from research.live_probe_control.control.admission_trace import AdmissionTrace, admission_trace_value
from research.live_probe_control.control.contracts import Request
from research.live_probe_control.control.probe_transport import ProbeOperation
from research.live_probe_control.peers.peer_control import PeerControl, WorkerProbePort
from research.live_probe_control.peers.peer_protocol import event_body


class AdmissionTraceTests(unittest.TestCase):
    def port(self):
        native = dict(configured_fps=30, negotiated_fps=30, width=640, height=480,
                      target_bitrate=1500, cpu_used=6, max_quantizer=48, state="playing",
                      connection_state="connected", ice_connection_state="connected",
                      capture_buffers=10, encoded_buffers=10)
        media = SimpleNamespace(bootstrap={"body": {"profile": {"fps": 30}}},
                                latest_snapshot=(dict(native), 10**9),
                                snapshot=Mock(side_effect=lambda: dict(native)))
        lease = SimpleNamespace(healthy=lambda: True)
        port = WorkerProbePort(media, Request("diag", fixtures.GEN, 24, 10**9), lease, 10**12)
        return port, media, native

    def trace(self):
        port, _, native = self.port()
        port.admission_trace = AdmissionTrace()
        native.update(capture_buffers=11, encoded_buffers=11)
        with patch("research.live_probe_control.peers.peer_control.time.monotonic_ns",
                   side_effect=[10**9, 10**9 + 10]):
            self.assertTrue(port.snapshot().healthy)
        return port.admission_trace.value()

    def test_disabled_trace_adds_no_clock_or_native_reads(self):
        port, media, _ = self.port()
        with patch("research.live_probe_control.peers.peer_control.time.monotonic_ns",
                   return_value=10**9) as clock:
            self.assertFalse(port.snapshot().healthy)
        clock.assert_called_once()
        media.snapshot.assert_called_once()
        self.assertIsNone(port.admission_trace)

    def test_trace_brackets_existing_read_and_preserves_counters(self):
        trace = self.trace()
        admission_trace_value(trace)
        row = trace["rows"][0]
        self.assertEqual(row["read_start_ns"], 10**9)
        self.assertEqual(row["checked_ns"], 10**9 + 10)
        self.assertEqual(row["previous"], dict(capture_buffers=10, encoded_buffers=10))
        self.assertEqual(row["current"], dict(capture_buffers=11, encoded_buffers=11))
        self.assertTrue(row["health_checks"]["native_progress_fresh"])

    def test_trace_preserves_stall_alternating_progress_and_regression_decisions(self):
        plain, _, plain_native = self.port()
        traced, media, traced_native = self.port()
        traced.admission_trace = AdmissionTrace()
        for i, pair in enumerate(((10, 10), (11, 10), (11, 11), (12, 12), (9, 9), (13, 13))):
            now = 10**9 + i * 10**7
            plain_native.update(capture_buffers=pair[0], encoded_buffers=pair[1])
            traced_native.update(plain_native)
            with patch("research.live_probe_control.peers.peer_control.time.monotonic_ns", return_value=now):
                self.assertEqual(plain.snapshot(), traced.snapshot())
            self.assertEqual(plain.last_health_checks, traced.last_health_checks)
        self.assertEqual(media.snapshot.call_count, 6)
        rows = traced.admission_trace.value()["rows"]
        self.assertTrue(rows[2]["health_checks"]["native_progress_fresh"])
        self.assertTrue(rows[3]["healthy"])
        self.assertFalse(rows[4]["health_checks"]["native_valid"])
        self.assertFalse(rows[5]["healthy"])

    def test_trace_is_bounded_and_returned_by_value(self):
        port, _, _ = self.port()
        port.admission_trace = AdmissionTrace()
        with patch("research.live_probe_control.peers.peer_control.time.monotonic_ns", return_value=10**9):
            for _ in range(40):
                port.snapshot()
        trace = port.admission_trace.value()
        self.assertEqual(len(trace["rows"]), 32)
        self.assertEqual(trace["completed_reads"], 40)
        self.assertTrue(trace["truncated"])
        admission_trace_value(trace)
        trace["rows"][0]["current"]["capture_buffers"] = 999
        self.assertEqual(port.admission_trace.value()["rows"][0]["current"]["capture_buffers"], 10)

    def test_legacy_trace_still_validates_without_reinterpreting_progress(self):
        trace = self.trace()
        trace["method"] = "n11-native-admission-progress-trace-v1"
        for row in trace["rows"]:
            del row["counter_progress_at_ns"]
        admission_trace_value(trace)

    def test_each_counter_must_have_its_own_recent_progress(self):
        port, _, native = self.port()
        for now, pair, expected in (
            (10**9, (11, 10), False),
            (1700000000, (11, 11), True),
            (1750000000, (11, 12), True),
            (1750000001, (11, 13), False),
        ):
            native.update(capture_buffers=pair[0], encoded_buffers=pair[1])
            with patch("research.live_probe_control.peers.peer_control.time.monotonic_ns", return_value=now):
                self.assertEqual(port.snapshot().healthy, expected)

    def test_cached_nonzero_counters_are_not_progress_evidence(self):
        port, _, _ = self.port()
        with patch("research.live_probe_control.peers.peer_control.time.monotonic_ns", return_value=1):
            self.assertFalse(port.snapshot().healthy)

    def test_protocol_and_checkpoint_preserve_trace_without_authority(self):
        trace = self.trace()
        body = dict(request_id="diag", result=None, rejection="ledger_unavailable",
                    rejection_stage="fresh_source", admission_progress=trace)
        event_body("probe_result", body)
        draft = SimpleNamespace(request=Request("diag", fixtures.GEN, 24, 10**9),
                                token="token", expires_ns=1, offer_hash="a" * 64,
                                settings_hash="b" * 64, policy_hash="c" * 64)
        operation = ProbeOperation(draft, SimpleNamespace(sequence=1, frames_decoded=1, presented_frames=1), 1)
        operation.finish(body)
        trace["rows"][0]["current"]["encoded_buffers"] = 999
        report = operation.checkpoint()
        self.assertEqual(report["admission_progress"]["rows"][0]["current"]["encoded_buffers"], 11)
        self.assertFalse(report["live_authority"])

    def test_failed_admission_traces_original_budget_and_never_opens_controller(self):
        port, _, _ = self.port()
        child = PeerControl(SimpleNamespace(bootstrap={"body": {}}), Mock())
        child.port = port
        child.lease = SimpleNamespace(delivery=deque([dict(sequence=1, observed_ns=1, received_ns=1)]),
                                      lock=threading.Lock())
        now = [10**9]
        with patch("research.live_probe_control.peers.peer_control.time.monotonic_ns",
                   side_effect=lambda: now[0]), patch(
                       "research.live_probe_control.peers.peer_control.time.sleep",
                       side_effect=lambda seconds: now.__setitem__(0, now[0] + int(seconds * 10**9))), patch(
                           "research.live_probe_control.peers.peer_control.CadenceController") as controller:
            child._execute(Request("diag", fixtures.GEN, 24, 10**9))
        controller.assert_not_called()
        self.assertEqual(now[0], 1150000000)
        body = child.results.get_nowait()
        event_body("probe_result", body)
        self.assertEqual(body["rejection_stage"], "fresh_source")
        self.assertFalse(body["rejection_health_checks"]["native_progress_fresh"])
        self.assertEqual(body["admission_progress"]["completed_reads"], 15)
        self.assertIsNone(port.admission_trace)
        self.assertFalse(port.touched)

    def test_validator_rejects_bad_or_unbound_evidence(self):
        trace = self.trace()
        for mutate in (
            lambda t: t.update(extra=True),
            lambda t: t.update(completed_reads=True),
            lambda t: t["rows"][0].update(checked_ns=0),
            lambda t: t["rows"][0]["current"].update(encoded_buffers=True),
            lambda t: t.update(rows=t["rows"] * 33),
        ):
            invalid = copy.deepcopy(trace)
            mutate(invalid)
            with self.assertRaises(ValueError):
                admission_trace_value(invalid)
        with self.assertRaises(ValueError):
            event_body("probe_result", dict(request_id="diag", result=None,
                       rejection="preconditions", admission_progress=trace))


if __name__ == "__main__":
    unittest.main()
