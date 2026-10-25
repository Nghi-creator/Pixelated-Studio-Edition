"""Closed peer transport and lifetime ownership; no native imports required."""

import signal
import subprocess
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from camera_config import configure_ice_servers
from live_probe_control.contracts import Generation
from live_probe_control.peer_protocol import (
    MAX_BUFFER,
    MAX_LINE,
    SNAPSHOT_COUNTERS,
    Lines,
    command,
    decode,
    encode,
    event,
)
from live_probe_control.peer_supervisor import PeerSupervisor, child_environment
from live_probe_control.peer_worker import PeerMedia, caps_values, counter

PROFILE = {"id": "balanced", "fps": 30, "bitrate_kbps": 1500}
GENERATION = Generation("owner", "pipeline", "peer")


def bootstrap():
    return command(
        GENERATION,
        0,
        "bootstrap",
        {
            "profile": dict(PROFILE),
            "ice_servers": [],
            "source": "isolated_synthetic",
        },
    )


def snapshot(stamp=1):
    return dict(
        read_start_ns=0,
        read_end_ns=stamp,
        state="ready",
        connection_state="unknown",
        ice_connection_state="unknown",
        **dict.fromkeys(SNAPSHOT_COUNTERS),
    )


class ProtocolTests(unittest.TestCase):
    def test_round_trip_and_fragmentation(self):
        request = bootstrap()
        wire = encode(request)
        stream = Lines()
        self.assertEqual(stream.feed(wire[:8], incoming_command=True), [])
        self.assertEqual(
            stream.feed(wire[8:] + wire, incoming_command=True), [request, request]
        )
        self.assertEqual(stream.buffer, b"")

    def test_closed_commands_and_no_mutation_authority(self):
        for kind in ("set_fps", "cadence", "pipeline", "cancel", "eval"):
            with self.subTest(kind=kind), self.assertRaises(ValueError):
                command(GENERATION, 1, kind, {})
        for body in (
            {"live_authority": True, "mutation_available": False},
            {"live_authority": False, "mutation_available": 0},
        ):
            with self.assertRaises(ValueError):
                event(bootstrap(), "ready", body)

    def test_strict_profile_and_identity(self):
        for key, value in (
            ("fps", True),
            ("fps", 23),
            ("fps", 61),
            ("bitrate_kbps", 499),
            ("id", "custom"),
        ):
            request = bootstrap()
            request["body"]["profile"][key] = value
            with self.subTest(key=key, value=value), self.assertRaises(ValueError):
                command(GENERATION, 0, "bootstrap", request["body"])
        for generation in (None, {"owner": "owner"}):
            with self.assertRaises(ValueError):
                command(generation, 0, "shutdown", {})
        for sequence in (True, -1, 256):
            with self.assertRaises(ValueError):
                command(GENERATION, sequence, "shutdown", {})

    def test_hash_and_closed_shape(self):
        for key, value in (("sequence", 1), ("surprise", 1)):
            request = bootstrap()
            request[key] = value
            with self.assertRaises(ValueError):
                decode(encode(request).rstrip(b"\n"), incoming_command=True)

    def test_json_abuse_and_bounded_buffers(self):
        for data in (
            b'{"x":1,"x":2}',
            b'{"x":NaN}',
            b"\xff",
            b"[" * 1500 + b"]" * 1500,
            b"x" * (MAX_LINE + 1),
        ):
            with self.subTest(data=data[:20]), self.assertRaises(ValueError):
                decode(data)
        with self.assertRaises(ValueError):
            Lines().feed(b"x" * (MAX_BUFFER + 1))
        with self.assertRaises(ValueError):
            Lines().feed(b"x" * (MAX_LINE + 1))

    def test_frame_processing_is_bounded(self):
        stream = Lines()
        wire = encode(event(bootstrap(), "snapshot", snapshot()))
        self.assertEqual(len(stream.feed(wire * 40)), 32)
        self.assertEqual(len(stream.feed(b"")), 8)

    def test_utf8_sdp_and_candidate_bounds(self):
        for value in ("x" * 65537, "é" * 32769, "", True):
            with self.assertRaises(ValueError):
                command(GENERATION, 1, "offer", {"sdp": value})
        for body in (
            {"index": True, "candidate": "a"},
            {"index": 0, "candidate": "a" * 4097},
        ):
            with self.assertRaises(ValueError):
                command(GENERATION, 1, "ice", body)

    def test_ice_configuration_is_data_only_and_bounded(self):
        for servers in (
            [{"urls": "https://example.com"}],
            [{"urls": []}],
            [{"urls": "stun:example.com", "extra": "x"}],
            [{"urls": "stun:example.com"}] * 9,
        ):
            body = bootstrap()["body"]
            body["ice_servers"] = servers
            with self.assertRaises(ValueError):
                command(GENERATION, 0, "bootstrap", body)

    def test_previous_protocol_and_missing_native_states_are_rejected(self):
        message = event(bootstrap(), "snapshot", snapshot())
        message["version"] = "n10-peer-ipc-v1"
        with self.assertRaises(ValueError):
            decode(encode(message))
        message = event(bootstrap(), "snapshot", snapshot())
        del message["body"]["connection_state"]
        with self.assertRaises(ValueError):
            decode(encode(message))
        for key in ("connection_state", "ice_connection_state"):
            body = snapshot()
            body[key] = "healthy"
            with self.assertRaises(ValueError):
                event(bootstrap(), "snapshot", body)

    def test_nullable_snapshot_and_timing(self):
        self.assertEqual(
            decode(encode(event(bootstrap(), "snapshot", snapshot())))["body"],
            snapshot(),
        )
        for key, value in (
            ("read_end_ns", -1),
            ("capture_buffers", True),
            ("state", "healthy"),
        ):
            body = snapshot()
            body[key] = value
            with self.assertRaises(ValueError):
                event(bootstrap(), "snapshot", body)


class SupervisorTests(unittest.TestCase):
    def owner(self):
        owner = PeerSupervisor(enabled=True, generation=GENERATION, clock=lambda: 100)
        request = owner._queue("bootstrap", bootstrap()["body"], "ready")
        owner.state = "starting"
        return owner, request

    def ready(self):
        owner, request = self.owner()
        owner._event(
            event(
                request, "ready", {"live_authority": False, "mutation_available": False}
            ),
            100,
        )
        return owner, request

    def test_disabled_and_unowned_never_spawn(self):
        for owner in (PeerSupervisor(), PeerSupervisor(enabled=True)):
            with patch("live_probe_control.peer_supervisor.subprocess.Popen") as spawn:
                with self.assertRaises(ValueError):
                    owner.start(PROFILE)
                spawn.assert_not_called()

    def test_ice_configuration_supports_quiet_private_transport(self):
        from unittest.mock import Mock

        native = Mock()
        emitted = []
        with patch("builtins.print") as output:
            configure_ice_servers(
                native, '[{"urls":"stun:example.com"}]', emit=emitted.append
            )
            output.assert_not_called()
        native.set_property.assert_called_once_with("stun-server", "stun:example.com")
        self.assertEqual(len(emitted), 1)

    def test_private_environment_drops_signaling_tokens(self):
        values = {
            "PATH": "/bin",
            "PIXELATED_ENGINE_TOKEN": "secret",
            "SOCKET_TOKEN": "secret",
        }
        self.assertEqual(child_environment(values), {"PATH": "/bin"})

    def test_generation_hash_and_duplicate_reply_rejected(self):
        for key, value in (
            ("generation", {"owner": "other", "pipeline": "pipeline", "peer": "peer"}),
            ("request_hash", "0" * 64),
        ):
            owner, request = self.owner()
            reply = event(
                request, "ready", {"live_authority": False, "mutation_available": False}
            )
            reply[key] = value
            with self.assertRaises(ValueError):
                owner._event(reply, 100)
        owner, request = self.ready()
        with self.assertRaises(ValueError):
            owner._event(
                event(
                    request,
                    "ready",
                    {"live_authority": False, "mutation_available": False},
                ),
                100,
            )

    def test_offer_retransmission_does_not_renegotiate(self):
        owner, _ = self.ready()
        seq = owner.offer("sdp")
        queued = owner.tx
        self.assertEqual(owner.offer("sdp"), seq)
        self.assertEqual(owner.tx, queued)
        self.assertEqual(owner.sequence, 2)
        with self.assertRaises(ValueError):
            owner.offer("different")

    def test_queue_detaches_caller_data(self):
        owner, _ = self.owner()
        body = {"sdp": "first"}
        request = owner._queue("offer", body, "answer")
        body["sdp"] = "changed"
        self.assertEqual(request["body"]["sdp"], "first")

    def test_snapshot_requires_ready_and_monotonic_child_clock(self):
        owner, request = self.owner()
        reply = event(request, "snapshot", snapshot())
        with self.assertRaises(ValueError):
            owner._event(reply, 100)
        owner, request = self.ready()
        owner._event(reply, 100)
        with self.assertRaises(ValueError):
            owner._event(reply, 101)

    def test_request_and_ice_budgets(self):
        owner, _ = self.ready()
        owner.sequence = 256
        with self.assertRaises(ValueError):
            owner.shutdown()
        owner, _ = self.ready()
        owner.ice_count = 128
        with self.assertRaises(ValueError):
            owner.ice(0, "candidate")

    def test_missing_native_values_stay_missing(self):
        for value in (None, True, -1, 1.2, 2**53):
            self.assertIsNone(counter(value))
        self.assertEqual(counter(0), 0)
        self.assertEqual(caps_values(None), (None, None, None))
        fields = SimpleNamespace(
            get_fraction=lambda _: (True, 30, 1), has_field=lambda _: False
        )
        caps = SimpleNamespace(get_size=lambda: 1, get_structure=lambda _: fields)
        self.assertEqual(caps_values(caps), (30, None, None))

    def test_worker_without_explicit_cli_does_not_import_gi(self):
        result = subprocess.run(
            [sys.executable, "-m", "live_probe_control.peer_worker"],
            cwd=Path(__file__).resolve().parents[2],
            capture_output=True,
            check=False,
            timeout=3,
        )
        self.assertEqual(result.returncode, 2)
        self.assertIn(b"dedicated private peer worker required", result.stderr)
        self.assertNotIn(b"gi", result.stderr)

    def test_poll_failure_tears_down_instead_of_leaving_live_child(self):
        owner, _ = self.ready()
        owner.child = SimpleNamespace(
            stdin=SimpleNamespace(fileno=lambda: 10),
            stdout=SimpleNamespace(fileno=lambda: 11),
            stderr=SimpleNamespace(fileno=lambda: 12),
        )
        owner.tx = b""
        with (
            patch("live_probe_control.peer_supervisor.os.read", return_value=b"bad\n"),
            patch.object(owner, "close") as close,
        ):
            self.assertEqual(owner.poll(), [])
            self.assertEqual(owner.state, "failed")
            close.assert_called_once()

    def test_closed_ack_requires_clean_exit_and_complete_frames(self):
        for code, tail, expected in (
            (0, b"", "closed"),
            (1, b"", "failed"),
            (-9, b"", "failed"),
            (0, b"partial", "failed"),
        ):
            with self.subTest(code=code, tail=tail):
                owner, _ = self.ready()
                owner.shutdown()
                request = command(GENERATION, 1, "shutdown", {})
                data = (
                    encode(event(request, "closed", {"teardown": "null_observed"}))
                    + tail
                )
                owner.tx = b""
                owner.child = SimpleNamespace(
                    stdout=SimpleNamespace(fileno=lambda: 11),
                    stderr=SimpleNamespace(fileno=lambda: 12),
                    poll=lambda code=code: code,
                )
                with (
                    patch(
                        "live_probe_control.peer_supervisor.os.read",
                        side_effect=(data, b"", b""),
                    ),
                    patch.object(owner, "close") as close,
                ):
                    owner.poll()
                    self.assertEqual(owner.state, expected)
                    close.assert_called_once()

    def test_native_end_of_ice_is_not_a_candidate(self):
        import queue

        media = PeerMedia.__new__(PeerMedia)
        media.events = queue.Queue(maxsize=1)
        media.failed = False
        media._ice(None, 0, None)
        media._ice(None, 0, "")
        self.assertTrue(media.events.empty())
        media._ice(None, 0, "candidate")
        self.assertEqual(media.events.get_nowait(), (0, "candidate"))
        media._ice(None, 0, "first")
        media._ice(None, 0, "overflow")
        self.assertTrue(media.failed)

    def test_stream_close_error_does_not_skip_guard_and_pidfd_cleanup(self):
        from unittest.mock import Mock

        owner = PeerSupervisor()
        stream = Mock()
        stream.close.side_effect = OSError("pipe close")
        child = Mock(returncode=0, stdin=stream, stdout=Mock(), stderr=Mock())
        child.poll.return_value = 0
        lease = SimpleNamespace(write_fd=88, child=None, close=Mock())
        owner.child, owner.pidfd, owner.lease = child, 99, lease
        with patch("live_probe_control.peer_supervisor.os.close") as close:
            self.assertFalse(owner.close())
            self.assertEqual([c.args for c in close.call_args_list], [(88,), (99,)])
        lease.close.assert_called_once()
        self.assertEqual(owner.state, "failed")
        self.assertEqual(owner.reason, "cleanup_failed")
        self.assertIsNone(owner.child)
        self.assertIsNone(owner.lease)

    def test_unreaped_child_retains_exact_handle_for_cleanup_retry(self):
        from unittest.mock import Mock

        owner = PeerSupervisor()
        child = Mock(returncode=None, stdin=Mock(), stdout=Mock(), stderr=Mock())
        child.poll.return_value = None
        child.wait.side_effect = subprocess.TimeoutExpired("child", 1)
        owner.child, owner.pidfd = child, 99
        with (
            patch(
                "live_probe_control.peer_supervisor.signal.pidfd_send_signal",
                create=True,
            ) as send,
            patch("live_probe_control.peer_supervisor.os.close") as close,
        ):
            self.assertFalse(owner.close())
            self.assertEqual(
                [c.args for c in send.call_args_list],
                [(99, signal.SIGTERM), (99, signal.SIGKILL)],
            )
            close.assert_not_called()
        self.assertIs(owner.child, child)
        self.assertEqual(owner.pidfd, 99)
        child.poll.return_value = 0
        child.returncode = 0
        child.wait.side_effect = None
        with patch("live_probe_control.peer_supervisor.os.close") as close:
            self.assertTrue(owner.close())
            close.assert_called_once_with(99)
        self.assertIsNone(owner.child)

    def test_owner_clock_cannot_regress(self):
        owner = PeerSupervisor(clock=iter((2, 1)).__next__)
        owner._now()
        with self.assertRaises(ValueError):
            owner._now()


if __name__ == "__main__":
    unittest.main()
