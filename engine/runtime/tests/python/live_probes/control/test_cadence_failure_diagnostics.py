"""First-failure evidence survives restoration without weakening lifecycle checks."""

import copy
import sys
import unittest
from dataclasses import asdict
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[4]))
from live_probes.control import test_live_probe_controller as fixtures
from research.live_probe_control.control.contracts import HEALTH_CHECKS, Request, failure_diagnostic
from research.live_probe_control.control.probe_transport import ProbeOperation
from research.live_probe_control.peers.peer_control import ReceiverLease, WorkerProbePort
from research.live_probe_control.peers.peer_protocol import event_body


class FailureDiagnosticTests(unittest.TestCase):
    def setUp(self):
        self.fixture = fixtures.ControllerTests()
        self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)

    def abort(self, change):
        port = self.fixture.port
        setter = port.set_fps

        def mutate(fps):
            setter(fps)
            if fps == 24:
                change(port)

        port.set_fps = mutate
        with self.fixture.control() as control:
            result = control.execute(Request("diag", fixtures.GEN, 24, fixtures.SECOND))
            diagnostic = copy.deepcopy(control.failure_diagnostic)
        self.assertEqual(result.outcome, "aborted")
        return result, diagnostic

    def test_guard_decisions_remain_aborted_and_distinguishable(self):
        for check, field, value in (
            ("snapshot_unhealthy", "healthy", False),
            ("settings_changed", "settings", "b" * 64),
            ("configured_fps_changed", "fps", 25),
            ("negotiated_fps_invalid", "negotiated", 25),
        ):
            with self.subTest(check=check):
                if self.fixture.port.calls:
                    self.setUp()
                _, diagnostic = self.abort(
                    lambda port, field=field, value=value: setattr(port, field, value)
                )
                self.assertEqual(diagnostic["check"], check)
                failure_diagnostic(diagnostic)

    def test_first_failure_survives_restoration(self):
        _, diagnostic = self.abort(lambda port: setattr(port, "healthy", False))
        self.assertEqual(diagnostic["snapshot"]["configured_fps"], 24)
        self.assertFalse(diagnostic["snapshot"]["healthy"])
        self.assertIn(30, self.fixture.port.calls)

    def test_exception_is_sanitized_and_has_no_invented_snapshot(self):
        def fail(port):
            raise RuntimeError("PRIVATE must never be serialized")

        _, diagnostic = self.abort(fail)
        self.assertEqual(diagnostic["check"], "control_exception")
        self.assertIsNone(diagnostic["snapshot"])
        self.assertNotIn("PRIVATE", str(diagnostic))

    def test_bad_optional_details_cannot_change_abort_or_cleanup(self):
        self.fixture.port.last_health_checks = {"unexpected": "PRIVATE"}
        result, diagnostic = self.abort(lambda port: setattr(port, "healthy", False))
        self.assertEqual(result.reason, "health_abort")
        self.assertIsNone(diagnostic)
        self.assertIn(30, self.fixture.port.calls)

    def test_completed_result_has_no_failure_diagnostic(self):
        with self.fixture.control() as control:
            result = control.execute(Request("diag", fixtures.GEN, 24, fixtures.SECOND))
            self.assertEqual(result.outcome, "completed")
            self.assertIsNone(control.failure_diagnostic)

    def body(self):
        result, diagnostic = self.abort(lambda port: setattr(port, "healthy", False))
        return dict(request_id="diag", result=asdict(result), rejection=None, diagnostic=diagnostic)

    def test_closed_wire_and_handle_preserve_by_value(self):
        body = self.body()
        self.assertEqual(event_body("probe_result", body), body)
        request = Request("diag", fixtures.GEN, 24, fixtures.SECOND)
        draft = SimpleNamespace(
            request=request,
            token="token",  # noqa: S106 -- synthetic local handle
            expires_ns=1,
            offer_hash="a" * 64,
            settings_hash="b" * 64,
            policy_hash="c" * 64,
        )
        op = ProbeOperation(
            draft, SimpleNamespace(sequence=1, frames_decoded=1, presented_frames=1), 1
        )
        op.finish(body)
        body["diagnostic"]["check"] = "cancelled"
        self.assertEqual(op.diagnostic["check"], "snapshot_unhealthy")
        self.assertTrue(op.done.is_set())

    def test_malformed_and_success_diagnostics_rejected(self):
        body = self.body()
        for value in (
            dict(body["diagnostic"], extra=True),
            dict(body["diagnostic"], check="arbitrary_exception_message"),
            dict(body["diagnostic"], method="old"),
            dict(body["diagnostic"], snapshot=dict(body["diagnostic"]["snapshot"], healthy=1)),
            dict(body["diagnostic"], health_checks={k: 1 for k in HEALTH_CHECKS}),
        ):
            with self.subTest(value=value), self.assertRaises(ValueError):
                event_body("probe_result", dict(body, diagnostic=value))
        for result in (
            None,
            dict(
                body["result"],
                outcome="completed",
                restoration="verified_by_port",
                reason="duration_elapsed",
            ),
        ):
            with self.assertRaises(ValueError):
                event_body("probe_result", dict(body, result=result))

    def test_receiver_loss_retains_freshness_without_extending_lease(self):
        now = [10**9]
        lease = ReceiverLease(
            dict(
                sequence=1, frames_decoded=1, presented_frames=1, healthy=True, observed_ns=now[0]
            ),
            clock=lambda: now[0],
        )
        self.assertTrue(lease.healthy())
        now[0] += 750000001
        self.assertFalse(lease.healthy())
        self.assertFalse(lease.last_health_checks["receiver_observation_fresh"])
        self.assertFalse(lease.last_health_checks["receiver_decode_fresh"])

    def test_native_failure_adds_no_receiver_or_capture_reads(self):
        native = dict(
            configured_fps=30,
            negotiated_fps=30,
            width=640,
            height=480,
            target_bitrate=1500,
            cpu_used=6,
            max_quantizer=48,
            state="playing",
            connection_state="disconnected",
            ice_connection_state="connected",
            capture_buffers=10,
            encoded_buffers=10,
        )
        lease, capture = Mock(), Mock()
        media = SimpleNamespace(
            bootstrap={"body": {"profile": {"fps": 30}}},
            latest_snapshot=None,
            snapshot=lambda: dict(native),
            capture_lease=capture,
        )
        port = WorkerProbePort(
            media, Request("diag", fixtures.GEN, 24, fixtures.SECOND), lease, 10**12
        )
        with patch(
            "research.live_probe_control.peers.peer_control.time.monotonic_ns", return_value=1
        ):
            self.assertFalse(port.snapshot().healthy)
        lease.healthy.assert_not_called()
        capture.healthy.assert_not_called()
        self.assertFalse(port.last_health_checks["connected"])
        self.assertIsNone(port.last_health_checks["receiver_healthy"])
        self.assertEqual(set(port.last_health_checks), set(HEALTH_CHECKS))

    def test_child_result_carries_the_frozen_failure(self):
        from research.live_probe_control.peers.peer_control import PeerControl

        body = self.body()
        child = PeerControl(SimpleNamespace(bootstrap={"body": {}}), Mock())
        child.config = Mock()
        child.port = SimpleNamespace(
            deadline=10**30, snapshot=lambda: SimpleNamespace(healthy=True)
        )
        control = Mock()
        from research.live_probe_control.control.contracts import Result

        control.execute.return_value = Result(**body["result"])
        control.failure_diagnostic = body["diagnostic"]
        manager = Mock()
        manager.__enter__ = Mock(return_value=control)
        manager.__exit__ = Mock(return_value=False)
        with patch(
            "research.live_probe_control.peers.peer_control.CadenceController", return_value=manager
        ):
            child._execute(Request("diag", fixtures.GEN, 24, fixtures.SECOND))
        self.assertEqual(child.results.get_nowait()["diagnostic"], body["diagnostic"])
        self.assertTrue(child.blocked)

    def test_resource_checkpoint_emits_before_cleanup_can_fail(self):
        sys.path.insert(0, str(Path(__file__).resolve().parents[4] / "scripts/research/n10"))
        from condition_observation import ConditionObservation

        from research.resource_observation.contained_condition import ResourceConditionObservation

        observer = object.__new__(ResourceConditionObservation)
        observer.operation = SimpleNamespace(diagnostic=self.body()["diagnostic"])
        observer.emit = Mock()
        with (
            patch.object(
                ConditionObservation, "checkpoint", side_effect=ValueError("cleanup failed")
            ),
            self.assertRaises(ValueError),
        ):
            observer.checkpoint()
        with patch.object(ConditionObservation, "checkpoint"):
            observer.checkpoint()
        observer.emit.assert_called_once()
        self.assertEqual(observer.emit.call_args.args[0], "n11_cadence_failure_diagnostic")
        self.assertFalse(observer.emit.call_args.kwargs["live_authority"])


if __name__ == "__main__":
    unittest.main()
