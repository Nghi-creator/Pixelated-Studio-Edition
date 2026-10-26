"""Closed engineering transport, owner isolation and receiver-lease failure checks."""

import copy
import signal
import sys
import tempfile
import time
import unittest
from dataclasses import asdict
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
import test_live_probe_local_owner as fixtures
from live_probe_control.camera_workers import CameraWorkers
from live_probe_control.contracts import Request, Result, Snapshot, digest
from live_probe_control.journal import CadenceJournal
from live_probe_control.peer_control import PeerControl, ReceiverLease, WorkerProbePort
from live_probe_control.peer_protocol import command, event
from live_probe_control.peer_supervisor import PeerSupervisor
from live_probe_control.probe_transport import EngineeringControl


class DispatchTests(unittest.TestCase):
    def setUp(self):
        self.fixture = fixtures.LocalOwnerTests()
        self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)
        self.fixture.ready()
        self.local, self.owner, self.receiver = (
            self.fixture.scope,
            self.fixture.owner,
            self.fixture.receiver,
        )
        self.service = self.fixture.service
        self.config = EngineeringControl.open(self.fixture.temp.name, fixtures.POLICY)
        self.service.control, self.service.source = self.config, "isolated_synthetic"
        self.submitted = []
        self.service.submit_probe = lambda peer, operation: self.submitted.append(
            (peer, operation)
        )
        self.draft = self.fixture.draft()

    def operation(self):
        return self.local.dispatch(self.owner, self.draft)

    def body(self):
        operation = self.operation()
        return dict(operation.body, receiver=operation.lease())

    def test_engineering_opt_in_and_source_are_required(self):
        for control, source in (
            (None, "isolated_synthetic"),
            (self.config, "production"),
        ):
            self.service.control, self.service.source = control, source
            with self.assertRaises(ValueError):
                self.operation()
        self.assertEqual(self.submitted, [])
        with self.assertRaises(ValueError):
            CameraWorkers(fixtures.PROFILE, "[]", 2, control=self.config)

    def test_foreign_owner_and_receiver_capability_cannot_dispatch(self):
        for capability in (self.receiver, object(), {}, None):
            with self.assertRaises(ValueError):
                self.local.dispatch(capability, self.draft)
        self.assertEqual(self.submitted, [])

    def test_idempotent_operation_returns_bound_old_handle_without_redispatch(self):
        operation = self.operation()
        self.fixture.now += 10**9
        self.assertIs(self.operation(), operation)
        self.assertEqual(len(self.submitted), 1)
        self.assertEqual(operation.request.generation, fixtures.GEN)
        self.assertFalse(operation.live_authority)

    def test_cancel_works_after_admission_expiry_but_requires_owner(self):
        operation = self.operation()
        self.fixture.now += 10**9
        with self.assertRaises(ValueError):
            self.local.cancel(self.receiver, operation)
        self.local.cancel(self.owner, operation)
        self.assertTrue(operation.cancelled.is_set())

    def test_configured_directory_cannot_change_with_request(self):
        with tempfile.TemporaryDirectory() as other:
            self.service.control = EngineeringControl.open(other, fixtures.POLICY)
            with self.assertRaises(ValueError):
                self.operation()
        self.assertEqual(self.submitted, [])

    def test_controller_transitions_require_issued_operation(self):
        operation = self.operation()
        self.fixture.observe(2, 30, configured_fps=24, negotiated_fps=24)
        lease = operation.lease()
        self.assertTrue(lease["healthy"])
        self.assertEqual(lease["sequence"], 2)
        self.assertEqual(lease["observed_ns"], self.fixture.now)
        with self.assertRaises(ValueError):
            self.fixture.draft(request_id="concurrent")

    def test_result_binding_is_validated_before_handle_state_changes(self):
        operation = self.operation()
        result = Result("other", "completed", "verified_by_port", "duration_elapsed")
        with self.assertRaises(ValueError):
            operation.finish(
                {"request_id": "other", "result": asdict(result), "rejection": None}
            )
        self.assertIsNone(operation.result)
        self.assertFalse(operation.done.is_set())
        operation.lost()
        self.assertEqual(operation.status, "worker_lost")
        self.assertIsNone(operation.result)

    def test_result_is_not_an_authority_grant(self):
        operation = self.operation()
        result = Result("request", "completed", "verified_by_port", "duration_elapsed")
        operation.finish(
            {"request_id": "request", "result": asdict(result), "rejection": None}
        )
        self.assertTrue(operation.done.is_set())
        self.assertFalse(operation.result.live_authority)
        with self.assertRaises(ValueError):
            operation.finish(
                {"request_id": "request", "result": asdict(result), "rejection": None}
            )

    def test_scope_close_requests_cancellation(self):
        operation = self.operation()
        self.local.close()
        self.assertTrue(operation.cancelled.is_set())
        with self.assertRaises(ValueError):
            self.local.dispatch(self.owner, self.draft)

    def test_bootstrap_cannot_enable_controls_for_production(self):
        with self.assertRaises(ValueError):
            command(
                fixtures.GEN,
                0,
                "bootstrap",
                {
                    "profile": fixtures.PROFILE,
                    "ice_servers": [],
                    "source": "production",
                    "control": self.config.wire(),
                },
            )

    def test_closed_probe_commands_have_no_unrestricted_setter(self):
        body = self.body()
        command(fixtures.GEN, 1, "probe", body)
        for key, value in (
            ("setter", "set_property"),
            ("expires_ns", True),
            ("policy_hash", "x"),
        ):
            modified = copy.deepcopy(body)
            modified[key] = value
            with self.assertRaises(ValueError):
                command(fixtures.GEN, 1, "probe", modified)
        with self.assertRaises(ValueError):
            command(fixtures.GEN, 1, "set_fps", {"fps": 24})

    def supervisor(self):
        value = PeerSupervisor(
            enabled=True, generation=fixtures.GEN, clock=lambda: self.fixture.now
        )
        value.state, value.control = "playing", self.config
        return value

    def test_supervisor_rejects_disabled_and_stale_generation_before_queue(self):
        body = self.body()
        supervisor = self.supervisor()
        supervisor.control = None
        with self.assertRaises(ValueError):
            supervisor.probe(body)
        supervisor.control = self.config
        body["request"]["generation"]["peer"] = "other"
        with self.assertRaises(ValueError):
            supervisor.probe(body)
        self.assertEqual(supervisor.pending, {})

    def test_supervisor_reserves_protocol_headroom_and_checks_result_identity(self):
        body = self.body()
        supervisor = self.supervisor()
        supervisor.sequence = 193
        with self.assertRaises(ValueError):
            supervisor.probe(body)
        supervisor.sequence = 1
        sequence = supervisor.probe(body)
        envelope = command(fixtures.GEN, sequence, "probe", body)
        wrong = event(
            envelope,
            "probe_result",
            {"request_id": "other", "result": None, "rejection": "busy"},
        )
        with self.assertRaises(ValueError):
            supervisor._event(wrong, self.fixture.now)
        right = event(
            envelope,
            "probe_result",
            {"request_id": "request", "result": None, "rejection": "busy"},
        )
        supervisor._event(right, self.fixture.now)
        self.assertIsNone(supervisor.probe_sequence)
        with self.assertRaises(ValueError):
            supervisor.probe_cancel("request")

    def test_unknown_probe_result_kills_exact_child_even_without_armed_watchdog(self):
        body = self.body()
        supervisor = self.supervisor()
        sequence = supervisor.probe(body)
        envelope = command(fixtures.GEN, sequence, "probe", body)
        result = Result("request", "unknown", "unknown", "journal_failed")
        reply = event(
            envelope,
            "probe_result",
            {"request_id": "request", "result": asdict(result), "rejection": None},
        )
        supervisor._event(reply, self.fixture.now)
        self.assertTrue(supervisor.probe_unresolved)
        supervisor.tx = b""
        supervisor.pidfd = 99
        supervisor.child = SimpleNamespace(
            stdout=SimpleNamespace(fileno=lambda: 11),
            stderr=SimpleNamespace(fileno=lambda: 12),
            poll=lambda: None,
        )
        supervisor.lease = Mock()
        with (
            patch(
                "live_probe_control.peer_supervisor.os.read",
                side_effect=BlockingIOError,
            ),
            patch(
                "live_probe_control.peer_supervisor.signal.pidfd_send_signal",
                create=True,
            ) as send,
        ):
            supervisor.poll()
            send.assert_called_once_with(99, signal.SIGKILL)
        self.assertFalse(supervisor.probe_unresolved)

    def test_child_exception_after_intent_is_unknown_even_if_guard_was_disarmed(self):
        for touched, guard, expected in (
            (False, None, "ledger_unavailable"),
            (True, None, None),
            (False, SimpleNamespace(child=None, write_fd=None), None),
        ):
            with self.subTest(touched=touched, guard=guard):
                child = PeerControl(
                    SimpleNamespace(bootstrap={"body": {}}), lambda *_: None
                )
                child.config = SimpleNamespace(
                    directory=self.fixture.temp.name,
                    policy=fixtures.POLICY,
                    check=lambda _: None,
                )
                child.port = SimpleNamespace(
                    deadline=time.monotonic_ns() + 10**9,
                    touched=touched,
                    snapshot=lambda: Snapshot(fixtures.GEN, 30, 30, "a" * 64, True),
                )
                controller = Mock()
                controller.guard = guard
                controller.execute.side_effect = RuntimeError("private fault detail")
                controller.__enter__ = Mock(return_value=controller)
                controller.__exit__ = Mock(return_value=False)
                with patch(
                    "live_probe_control.peer_control.CadenceController",
                    return_value=controller,
                ):
                    child._execute(self.draft.request)
                body = child.results.get_nowait()
                self.assertEqual(body["rejection"], expected)
                if expected is None:
                    self.assertEqual(body["result"]["outcome"], "unknown")
                    self.assertEqual(body["result"]["restoration"], "unknown")
                    self.assertTrue(child.blocked)
                else:
                    self.assertIsNone(body["result"])

    def test_intent_persisted_before_memory_update_is_unknown_not_rejected(self):
        self.fixture.ledger(active=True)
        with CadenceJournal(self.fixture.temp.name) as store:
            ledger = copy.deepcopy(store.journal)
            ledger["active"] = "request"
            ledger["history"][0]["request"] = asdict(self.draft.request)
            ledger["history"][0]["request_hash"] = digest(asdict(self.draft.request))
            store.save(ledger)
        child = PeerControl(SimpleNamespace(bootstrap={"body": {}}), lambda *_: None)
        child.config = self.config
        controller = SimpleNamespace(guard=None, store=SimpleNamespace(journal=None))
        self.assertTrue(child._retained_intent(self.draft.request, controller))
        self.assertFalse(child._retained_intent(self.draft.request, None))
        self.assertEqual(self.fixture.scope._ledger()["state"], "active")

    def test_partial_native_setter_is_marked_touched_and_foreign_rate_is_not_overwritten(
        self,
    ):
        rate = {"fps": 30}
        calls = []

        def partial_set(_key, _caps):
            calls.append(24)
            rate["fps"] = 24
            raise RuntimeError("failure after native change")

        media = SimpleNamespace(
            bootstrap={"body": {"profile": fixtures.PROFILE}},
            latest_snapshot=None,
            snapshot=lambda: {"configured_fps": rate["fps"]},
            pipeline=SimpleNamespace(
                get_by_name=lambda _: SimpleNamespace(set_property=partial_set)
            ),
            gst=SimpleNamespace(Caps=SimpleNamespace(from_string=lambda value: value)),
        )
        port = WorkerProbePort(
            media,
            Request("partial", fixtures.GEN, 24, 10**9),
            None,
            time.monotonic_ns() + 10**9,
        )
        with self.assertRaises(RuntimeError):
            port.set_fps(24)
        self.assertTrue(port.touched)
        self.assertEqual(rate["fps"], 24)
        rate["fps"] = 25
        with self.assertRaises(ValueError):
            port.set_fps(30)
        self.assertEqual(calls, [24])

    def test_enabled_control_cannot_make_importing_process_a_dedicated_worker(self):
        body = self.body()
        emitted = []
        media = SimpleNamespace(
            bootstrap={
                "body": {"source": "isolated_synthetic", "control": self.config.wire()}
            }
        )
        child = PeerControl(media, lambda *args: emitted.append(args))
        child.start(command(fixtures.GEN, 1, "probe", body))
        self.assertEqual(emitted[0][2]["rejection"], "disabled")
        self.assertIsNone(child.thread)

    def test_default_child_rejects_probe_without_touching_native_media(self):
        body = self.body()
        emitted = []
        media = SimpleNamespace(bootstrap={"body": {"source": "production"}})
        child = PeerControl(media, lambda *args: emitted.append(args))
        child.start(command(fixtures.GEN, 1, "probe", body))
        self.assertEqual(emitted[0][2]["rejection"], "disabled")
        self.assertIsNone(child.thread)
        self.assertFalse(WorkerProbePort.dedicated_process)


class ReceiverLeaseTests(unittest.TestCase):
    def setUp(self):
        self.now = 10**9
        self.value = {
            "sequence": 1,
            "frames_decoded": 10,
            "presented_frames": 10,
            "healthy": True,
            "observed_ns": self.now,
        }
        self.lease = ReceiverLease(self.value, clock=lambda: self.now)

    def update(self, **changes):
        self.now += 200000000
        value = dict(
            self.value,
            sequence=self.value["sequence"] + 1,
            frames_decoded=20,
            presented_frames=20,
            observed_ns=self.now,
        )
        value.update(changes)
        self.lease.update(value)
        self.value = value

    def test_fresh_counts_keep_lease_and_stale_observation_does_not(self):
        self.assertTrue(self.lease.healthy())
        self.update()
        self.assertTrue(self.lease.healthy())
        self.now += 750000001
        self.assertFalse(self.lease.healthy())

    def test_repeated_counts_cannot_renew_progress_indefinitely(self):
        for _ in range(4):
            self.update(frames_decoded=10, presented_frames=10)
        self.assertFalse(self.lease.healthy())

    def test_receiver_reset_replay_and_future_stamp_fail_closed(self):
        for changes in (
            {"sequence": 1},
            {"frames_decoded": 9},
            {"observed_ns": self.now + 10**9},
        ):
            self.setUp()
            with self.assertRaises(ValueError):
                self.update(**changes)
            self.assertFalse(self.lease.healthy())

    def test_false_health_cannot_be_revived_by_new_counters(self):
        self.update(healthy=False)
        self.update(healthy=True, frames_decoded=30, presented_frames=30)
        self.assertFalse(self.lease.healthy())

    def test_missing_or_boolean_receipt_is_not_a_valid_lease(self):
        for value in (
            dict(self.value, observed_ns=True),
            {k: v for k, v in self.value.items() if k != "observed_ns"},
        ):
            with self.assertRaises(ValueError):
                ReceiverLease(value)


if __name__ == "__main__":
    unittest.main()
