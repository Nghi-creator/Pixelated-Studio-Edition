"""Opt-in exact-process supervisor. Call from an owner control thread, never media callbacks."""

import os
import signal
import subprocess
import sys
import time
import uuid
from dataclasses import asdict
from pathlib import Path

from .contracts import Generation
from .peer_lifetime import ParentLease
from .peer_protocol import MAX_BUFFER, MAX_COMMANDS, Lines, command, decode, encode

SECOND = 1000000000
ENVIRONMENT = frozenset(
    (
        "PATH",
        "PYTHONPATH",
        "LD_LIBRARY_PATH",
        "GI_TYPELIB_PATH",
        "GST_PLUGIN_PATH",
        "GST_PLUGIN_SYSTEM_PATH",
        "GST_REGISTRY",
        "GST_DEBUG",
        "XDG_RUNTIME_DIR",
        "XDG_CACHE_HOME",
        "PULSE_SERVER",
        "PULSE_COOKIE",
        "HOME",
        "LANG",
        "LC_ALL",
        "PYTHONPYCACHEPREFIX",
        "PYTHONDONTWRITEBYTECODE",
    )
)


def child_environment(environment):
    return {key: value for key, value in environment.items() if key in ENVIRONMENT}


class PeerSupervisor:
    """One owned pipeline, no camera routing and no live mutation authority.

    Context ownership and frequent poll() calls are required. The independent
    lease kills only this exact child when owner polling/pipe ownership is lost.
    """

    live_authority = False
    mutation_available = False

    def __init__(self, *, enabled=False, generation=None, clock=time.monotonic_ns):
        if type(enabled) is not bool or (
            generation is not None and type(generation) is not Generation
        ):
            raise ValueError("explicit peer opt-in/typed generation required")
        self.enabled = enabled
        self.generation = generation or Generation(
            *(uuid.uuid4().hex for _ in range(3))
        )
        self.clock = clock
        self.last_clock = None
        self.child = self.pidfd = self.lease = None
        self.entered = False
        self.state = "new"
        self.reason = None
        self.sequence = 0
        self.pending = {}
        self.anchors = {}
        self.lines = Lines()
        self.tx = b""
        self.stderr_bytes = 0
        self.last_heartbeat = 0
        self.last_snapshot = None
        self.last_snapshot_received = None
        self.offer_hash = self.offer_sequence = None
        self.ice_count = 0
        self.closed_reply = None
        self.exit_code = None
        self.close_deadline = None

    def __enter__(self):
        if self.entered or self.state != "new":
            raise ValueError("peer supervisor already owned")
        self.entered = True
        return self

    def __exit__(self, *_):
        self.close()
        self.entered = False

    def _now(self):
        value = self.clock()
        if (
            type(value) is not int
            or value < 0
            or (self.last_clock is not None and value < self.last_clock)
        ):
            raise ValueError("peer owner clock unavailable")
        self.last_clock = value
        return value

    def _queue(self, kind, body, expected, timeout=5 * SECOND):
        if self.sequence >= MAX_COMMANDS or len(self.pending) >= 32:
            raise ValueError("private peer request budget exceeded")
        request = command(self.generation, self.sequence, kind, body)
        data = encode(request)
        if len(self.tx) + len(data) > MAX_BUFFER:
            raise ValueError("private peer write buffer exceeded")
        # Detached validated copy: caller changes cannot rewrite an active anchor.
        request = decode(data.rstrip(b"\n"), incoming_command=True)
        self.tx += data
        self.pending[self.sequence] = (
            request["request_hash"],
            expected,
            self._now() + timeout,
        )
        self.anchors[self.sequence] = request["request_hash"]
        self.sequence += 1
        return request

    def start(self, profile, *, ice_servers=None, source="production"):
        if not self.enabled or not self.entered or self.state != "new":
            raise ValueError("dedicated peer disabled or not exclusively owned")
        if (
            sys.platform != "linux"
            or not hasattr(os, "pidfd_open")
            or not hasattr(signal, "pidfd_send_signal")
        ):
            raise ValueError("exact-process peer supervision unavailable")
        # Validate all caller data before allocating a native process.
        body = {
            "profile": profile,
            "ice_servers": [] if ice_servers is None else ice_servers,
            "source": source,
        }
        command(self.generation, 0, "bootstrap", body)
        environment = child_environment(os.environ)
        try:
            self.child = subprocess.Popen(
                [
                    sys.executable,
                    "-u",
                    "-m",
                    "live_probe_control.peer_worker",
                    "--dedicated-peer-worker",
                ],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                bufsize=0,
                cwd=Path(__file__).resolve().parents[1],
                env=environment,
            )
            # The child is not reaped/polled before opening its exact lifetime fd.
            self.pidfd = os.pidfd_open(self.child.pid)
            for stream in (self.child.stdin, self.child.stdout, self.child.stderr):
                os.set_blocking(stream.fileno(), False)
            self.lease = ParentLease(self.pidfd, environment)
            self.last_heartbeat = self._now()
            self.lease.heartbeat()
            self.state = "starting"
            self._queue("bootstrap", body, "ready")
        except BaseException:
            self.state = "failed"
            self.reason = "startup_failed"
            self.close()
            raise

    def offer(self, sdp):
        if self.state not in ("ready", "answering", "playing"):
            raise ValueError("peer not ready for an offer")
        candidate = command(self.generation, self.sequence, "offer", {"sdp": sdp})
        if self.offer_hash is not None:
            # A retransmission is not a second negotiation/native setter.
            from .contracts import digest

            if self.offer_hash == digest(candidate["body"]):
                return self.offer_sequence
            raise ValueError("peer replacement requires a new worker generation")
        from .contracts import digest

        request = self._queue("offer", {"sdp": sdp}, "answer", 8 * SECOND)
        self.offer_hash = digest(request["body"])
        self.offer_sequence = request["sequence"]
        self.state = "answering"
        return request["sequence"]

    def ice(self, index, candidate):
        if (
            self.state not in ("starting", "ready", "answering", "playing")
            or self.ice_count >= 128
        ):
            raise ValueError("peer ICE unavailable")
        result = self._queue("ice", {"index": index, "candidate": candidate}, "ack")
        self.ice_count += 1
        return result["sequence"]

    def shutdown(self):
        if self.state not in ("starting", "ready", "answering", "playing"):
            raise ValueError("peer shutdown unavailable")
        self._queue("shutdown", {}, "closed", 2 * SECOND)
        self.state = "closing"
        self.close_deadline = self._now() + 2 * SECOND

    def _event(self, message, now):
        if message["generation"] != asdict(self.generation):
            raise ValueError("stale private peer generation")
        seq, kind = message["sequence"], message["kind"]
        if self.anchors.get(seq) != message["request_hash"]:
            raise ValueError("unbound private peer reply")
        if kind in ("ready", "answer", "ack", "closed"):
            pending = self.pending.get(seq)
            if pending is None or pending[1] != kind:
                raise ValueError("duplicate or unexpected peer reply")
            del self.pending[seq]
            if kind == "ready":
                if self.state == "starting":
                    self.state = "ready"
                self.last_snapshot_received = now
            elif kind == "answer":
                if self.state == "answering":
                    self.state = "playing"
                self.last_snapshot_received = now
            elif kind == "closed":
                self.closed_reply = message["body"]["teardown"]
            if kind not in ("ready", "answer"):
                self.anchors.pop(seq, None)
        elif kind == "snapshot":
            if seq != 0 or self.state == "starting":
                raise ValueError("peer snapshot without bootstrap acknowledgement")
            stamp = message["body"]["read_end_ns"]
            if (
                self.last_snapshot is not None
                and stamp <= self.last_snapshot["read_end_ns"]
            ):
                raise ValueError("peer snapshot clock regressed")
            self.last_snapshot = message["body"]
            self.last_snapshot_received = now
        elif kind == "ice":
            if seq != self.offer_sequence:
                raise ValueError("peer ICE belongs to a stale negotiation")
        elif kind == "error":
            raise ValueError("peer reported failure")
        return message

    def poll(self):
        if self.child is None or self.state in ("closed", "failed"):
            return []
        try:
            now = self._now()
            if now - self.last_heartbeat >= 500000000:
                self.lease.heartbeat()
                self.last_heartbeat = now
            if self.tx:
                try:
                    count = os.write(self.child.stdin.fileno(), self.tx[:16384])
                    self.tx = self.tx[count:]
                except BlockingIOError:
                    pass
            events = []
            eof = False
            for _ in range(4):
                try:
                    data = os.read(self.child.stdout.fileno(), 16384)
                except BlockingIOError:
                    break
                if not data:
                    eof = True
                    break
                events.extend(self._event(m, now) for m in self.lines.feed(data))
            # Drain already buffered complete frames even without another read.
            events.extend(self._event(m, now) for m in self.lines.feed(b""))
            for _ in range(4):
                try:
                    data = os.read(self.child.stderr.fileno(), 16384)
                except BlockingIOError:
                    break
                if not data:
                    break
                self.stderr_bytes += len(data)
                if self.stderr_bytes > 1048576:
                    raise ValueError("private peer stderr budget exceeded")
            if any(now > value[2] for value in self.pending.values()):
                raise ValueError("private peer reply deadline")
            if (
                self.state in ("ready", "playing")
                and self.last_snapshot_received is not None
                and now - self.last_snapshot_received > 3 * SECOND
            ):
                raise ValueError("private peer snapshot stalled")
            if self.state == "closing" and now > self.close_deadline:
                raise ValueError("private peer exit deadline")
            code = self.child.poll()
            if eof and code is None and self.state == "closing":
                return events
            if eof or code is not None:
                if (
                    self.state == "closing"
                    and code == 0
                    and self.closed_reply == "null_observed"
                    and not self.lines.buffer
                ):
                    self.state = "closed"
                else:
                    self.state = "failed"
                    self.reason = "worker_terminated"
                self.close()
            return events
        except (
            OSError,
            ValueError,
            TypeError,
            KeyError,
            AttributeError,
            RecursionError,
        ):
            self.state = "failed"
            self.reason = "transport_failed"
            self.close()
            return []

    def close(self):
        ok = True
        if self.lease is not None and self.lease.write_fd is not None:
            try:
                os.close(self.lease.write_fd)
            except OSError:
                ok = False
            finally:
                self.lease.write_fd = None
        if self.child is not None:
            try:
                if self.child.poll() is None:
                    if self.pidfd is not None:
                        try:
                            signal.pidfd_send_signal(self.pidfd, signal.SIGTERM)
                        except ProcessLookupError:
                            pass
                    else:
                        # Startup failed before pidfd acquisition; this unreaped
                        # exact Popen child remains ours, never a PID from disk.
                        self.child.terminate()
                    try:
                        self.child.wait(timeout=0.5)
                    except subprocess.TimeoutExpired:
                        if self.pidfd is not None:
                            try:
                                signal.pidfd_send_signal(self.pidfd, signal.SIGKILL)
                            except ProcessLookupError:
                                pass
                        else:
                            self.child.kill()
                        self.child.wait(timeout=1)
                else:
                    self.child.wait(timeout=0)
            except (OSError, subprocess.TimeoutExpired):
                ok = False
            self.exit_code = self.child.returncode
            for stream in (self.child.stdin, self.child.stdout, self.child.stderr):
                if stream is not None:
                    try:
                        stream.close()
                    except OSError:
                        ok = False
            # Keep an unreaped child handle available for an explicit retry.
            if self.child.returncode is not None:
                self.child = None
        if self.lease is not None:
            try:
                self.lease.close()
            except (OSError, subprocess.TimeoutExpired):
                ok = False
            if self.lease.child is None:
                self.lease = None
        if self.pidfd is not None and self.child is None:
            try:
                os.close(self.pidfd)
            except OSError:
                ok = False
            finally:
                self.pidfd = None
        self.tx = b""
        self.pending.clear()
        if not ok:
            self.state = "failed"
            self.reason = "cleanup_failed"
        elif self.state not in ("failed", "closed"):
            self.state = "closed"
        return ok
