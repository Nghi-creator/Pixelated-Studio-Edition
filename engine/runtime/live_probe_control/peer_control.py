"""Child-only engineering controller runner; main IPC loop remains responsive."""

import queue
import sys
import threading
import time
from dataclasses import asdict

from .contracts import Generation, Result, Snapshot, digest
from .controller import CadenceController
from .journal import CadenceJournal
from .probe_transport import EngineeringControl, receiver_value, request_value

SETTINGS = (
    "configured_fps",
    "negotiated_fps",
    "width",
    "height",
    "target_bitrate",
    "cpu_used",
    "max_quantizer",
)
LEASE_NS = 750000000


class ReceiverLease:
    def __init__(self, value, *, clock=time.monotonic_ns):
        self.clock, self.lock = clock, threading.Lock()
        self.valid = True
        self.value = dict(receiver_value(value))
        self.received = self.clock()
        self.progress = dict.fromkeys(
            ("frames_decoded", "presented_frames"), self.received
        )

    def update(self, value):
        value = dict(receiver_value(value))
        with self.lock:
            now = self.clock()
            if (
                value["sequence"] <= self.value["sequence"]
                or now < self.received
                or value["observed_ns"] <= self.value["observed_ns"]
                or not 0 <= now - value["observed_ns"] <= LEASE_NS
            ):
                self.valid = False
                raise ValueError("receiver lease replay/reversal")
            for key in self.progress:
                if value[key] < self.value[key]:
                    self.valid = False
                    raise ValueError("receiver lease counter reset")
                if value[key] > self.value[key]:
                    self.progress[key] = value["observed_ns"]
            self.valid = self.valid and value["healthy"]
            self.value, self.received = value, now

    def healthy(self):
        with self.lock:
            now = self.clock()
            return (
                self.valid
                and self.value["healthy"]
                and all(
                    0 <= now - stamp <= LEASE_NS
                    for stamp in (
                        self.received,
                        self.value["observed_ns"],
                        *self.progress.values(),
                    )
                )
            )

    def counts(self):
        with self.lock:
            return dict(self.value)


class WorkerProbePort:
    # Only the dedicated CLI runner constructs its local eligible subclass.
    dedicated_process = False

    def __init__(self, media, request, lease, deadline):
        self.media, self.request, self.lease = media, request, lease
        self.generation = request.generation
        self.deadline = deadline
        self.prior_fps = media.bootstrap["body"]["profile"]["fps"]
        self.touched = False
        cached = media.latest_snapshot
        self.last = cached[0] if cached is not None else None
        self.progress_at = 0
        self.valid = True
        self.last_native = None

    def snapshot(self):
        value = self.media.snapshot()
        now = time.monotonic_ns()
        keys = ("capture_buffers", "encoded_buffers")
        if self.last is not None and all(
            self.last[k] is not None and value[k] is not None for k in keys
        ):
            if any(value[k] < self.last[k] for k in keys):
                self.valid = False
            if all(value[k] > self.last[k] for k in keys):
                self.progress_at = now
        self.last = self.last_native = value
        settings = {key: value[key] for key in SETTINGS[2:]}
        if any(v is None for v in settings.values()):
            self.valid = False
        return Snapshot(
            self.generation,
            value["configured_fps"],
            value["negotiated_fps"],
            digest(settings),
            self.valid
            and value["state"] == "playing"
            and value["connection_state"] == "connected"
            and value["ice_connection_state"] in ("connected", "completed")
            and all(value[k] is not None and value[k] > 0 for k in keys)
            and 0 <= now - self.progress_at <= LEASE_NS
            and self.lease.healthy()
            and (getattr(self.media, "capture_lease", None) is None or self.media.capture_lease.healthy()),
        )

    def set_fps(self, fps):
        if type(fps) is not int or fps not in (self.prior_fps, self.request.target_fps):
            raise ValueError("setter outside exact request/preimage")
        if fps != self.prior_fps and time.monotonic_ns() > self.deadline:
            raise ValueError("probe admission expired before setter")
        if getattr(self.media, "capture_lease", None) is not None and not self.media.capture_lease.healthy(force=True):
            raise ValueError("owned capture identity lost before setter")
        current = self.media.snapshot()["configured_fps"]
        if current not in (self.prior_fps, self.request.target_fps):
            raise ValueError("foreign cadence cannot be overwritten")
        self.touched = True  # A partial native setter is still a touched pipeline.
        self.media.pipeline.get_by_name("source_rate").set_property(
            "caps", self.media.gst.Caps.from_string(f"video/x-raw,framerate={fps}/1")
        )

    def verify_restored(self, prior, deadline_ns):
        initial = self.lease.counts()
        self.snapshot()
        native = dict(self.last_native)
        started = time.monotonic_ns()
        while time.monotonic_ns() < deadline_ns:
            current = self.snapshot()
            if (
                current.generation != prior.generation
                or current.settings_hash != prior.settings_hash
                or not current.healthy
                or current.configured_fps != prior.configured_fps
            ):
                return False
            if current.negotiated_fps != prior.negotiated_fps:
                time.sleep(0.02)
                continue
            receiver = self.lease.counts()
            if (
                time.monotonic_ns() - started >= 200000000
                and receiver["sequence"] >= initial["sequence"] + 2
                and all(
                    receiver[k] > initial[k]
                    for k in ("frames_decoded", "presented_frames")
                )
                and all(
                    self.last_native[k] >= native[k] + 2
                    for k in ("capture_buffers", "encoded_buffers")
                )
            ):
                return True
            time.sleep(0.02)
        return False


class PeerControl:
    def __init__(self, media, emit):
        self.media, self.emit = media, emit
        raw = media.bootstrap["body"].get("control")
        self.config = EngineeringControl.from_wire(raw) if raw is not None else None
        self.active = self.thread = self.lease = self.port = self.controller = None
        self.cancelled = threading.Event()
        self.results = queue.Queue(maxsize=1)
        self.blocked = False

    def start(self, envelope):
        body = envelope["body"]
        request = request_value(body["request"])
        rejection = None
        if (
            self.config is None
            or sys.argv[1:] != ["--dedicated-peer-worker"]
            or not self.config.matches_source(self.media.bootstrap["body"]["source"])
        ):
            rejection = "disabled"
        elif (
            self.blocked
            or (self.thread is not None and self.thread.is_alive())
            or not self.results.empty()
        ):
            rejection = "busy"
        else:
            native = self.media.snapshot()
            if (
                (self.config.capture is not None and (getattr(self.media, "capture_lease", None) is None
                    or not self.media.capture_lease.healthy(force=True)))
                or request.generation != Generation(**envelope["generation"])
                or request.generation
                != Generation(**self.media.bootstrap["generation"])
                or self.media.offer is None
                or body["offer_hash"] != digest(self.media.offer["body"])
                or body["settings_hash"] != digest(tuple(native[k] for k in SETTINGS))
                or body["policy_hash"] != digest(asdict(self.config.policy))
                or not 0 < body["expires_ns"] - time.monotonic_ns() <= 250000000
                or body["receiver"]["healthy"] is not True
            ):
                rejection = "preconditions"
        if rejection is not None:
            self.emit(
                envelope,
                "probe_result",
                {
                    "request_id": request.request_id,
                    "result": None,
                    "rejection": rejection,
                },
            )
            return
        self.active = envelope
        self.cancelled.clear()
        self.lease = ReceiverLease(body["receiver"])

        class DedicatedPort(WorkerProbePort):
            dedicated_process = True

        self.port = DedicatedPort(self.media, request, self.lease, body["expires_ns"])
        self.thread = threading.Thread(
            target=self._execute,
            args=(request,),
            daemon=True,
            name="peer-cadence-control",
        )
        self.thread.start()

    def _retained_intent(self, request, control):
        if control is None:
            return False  # No controller lease was acquired, so no local intent was written.

        def matches(ledger):
            return (
                isinstance(ledger, dict)
                and ledger.get("state") != "clean"
                and ledger.get("active") == request.request_id
            )

        if matches(control.store.journal):
            return True
        # replace/fsync can fail after intent reaches disk but before the store's
        # in-memory copy updates. Reopen under the same no-follow/identity rules.
        try:
            with CadenceJournal(self.config.directory) as store:
                self.config.check(store)
                return matches(store.journal)
        except Exception:  # noqa: BLE001 -- uncertain durable intent requires exact-worker teardown
            return True

    def _execute(self, request):
        result, rejection = None, None
        control = None
        try:
            # Establish actual fresh source progress before reserving any action.
            until = min(self.port.deadline, time.monotonic_ns() + 150000000)
            while time.monotonic_ns() < until:
                if self.port.snapshot().healthy:
                    break
                time.sleep(0.01)
            else:
                raise ValueError("fresh source/receiver preimage unavailable")
            with CadenceController(
                self.config.directory, self.config.policy, self.port, enabled=True
            ) as control:
                self.controller = control
                self.config.check(control.store)
                result = control.execute(request, cancelled=self.cancelled.is_set)
                self.blocked = result.restoration == "unknown"
        except Exception:  # noqa: BLE001 -- unknown after intent is never a no-effect rejection
            if (
                self.port.touched
                or (control is not None and control.guard is not None)
                or self._retained_intent(request, control)
            ):
                result = Result(
                    request.request_id, "unknown", "unknown", "journal_failed"
                )
                self.blocked = True
            else:
                rejection = "ledger_unavailable"
        self.results.put_nowait(
            {
                "request_id": request.request_id,
                "result": asdict(result) if result is not None else None,
                "rejection": rejection,
            }
        )

    def heartbeat(self, body):
        if (
            self.active is None
            or body["request_id"] != self.active["body"]["request"]["request_id"]
        ):
            raise ValueError("stale receiver lease")
        self.lease.update(body["receiver"])

    def cancel(self, request_id=None):
        if request_id is not None and (
            self.active is None
            or request_id != self.active["body"]["request"]["request_id"]
        ):
            raise ValueError("stale probe cancellation")
        self.cancelled.set()

    def poll(self):
        try:
            body = self.results.get_nowait()
        except queue.Empty:
            return
        self.emit(self.active, "probe_result", body)

    def running(self):
        return self.blocked or (self.thread is not None and self.thread.is_alive())
