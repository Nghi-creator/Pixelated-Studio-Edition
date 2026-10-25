"""Bounded camera adapter. Main-loop methods never wait for native child work."""

import json
import queue
import threading
import time
import uuid
from dataclasses import dataclass, field

from .contracts import SECOND, Generation
from .peer_protocol import command
from .peer_supervisor import PeerSupervisor


def workers_enabled(environment):
    value = environment.get("PIXELATED_DEDICATED_PEER_WORKERS", "0")
    if value not in ("0", "1"):
        raise ValueError("PIXELATED_DEDICATED_PEER_WORKERS requires 0 or 1")
    if value == "0":
        return False
    if environment.get("PIXELATED_STAGE_TRACE", "0") != "0" or environment.get(
        "PIXELATED_N5_CAMPAIGN_DIRECTORY"
    ):
        raise ValueError("dedicated peers do not yet support N4/N5 tracing")
    return True


@dataclass
class Slot:
    peer_id: str
    sdp: str
    token: str = field(default_factory=lambda: uuid.uuid4().hex)
    inbox: queue.Queue = field(default_factory=lambda: queue.Queue(maxsize=128))
    events: queue.Queue = field(default_factory=lambda: queue.Queue(maxsize=64))
    stop: threading.Event = field(default_factory=threading.Event)
    done: threading.Event = field(default_factory=threading.Event)
    thread: threading.Thread | None = None
    owner: object = None
    seen_ns: int = 0
    failure: str | None = None
    reported: bool = False
    cleanup_ok: bool = False


class CameraWorkers:
    """One owner thread per bounded slot; callers serialize methods on GLib.

    poll() is the main-loop lease. All child waits occur in slot threads. Retiring
    slots still consume capacity until reaped, bounding reconnect/startup churn.
    """

    def __init__(
        self, profile, raw_ice, maximum, *, source="production", factory=PeerSupervisor
    ):
        if type(maximum) is not int or not 1 <= maximum <= 16:
            raise ValueError("invalid dedicated peer capacity")
        self.profile = {key: profile[key] for key in ("id", "fps", "bitrate_kbps")}
        self.ice_servers = json.loads(raw_ice)
        command(
            Generation("check", "check", "check"),
            0,
            "bootstrap",
            {
                "profile": self.profile,
                "ice_servers": self.ice_servers,
                "source": source,
            },
        )
        self.source, self.factory, self.maximum = source, factory, maximum
        self.active = {}
        self.retired = []
        self.closed = False

    def _reap(self):
        self.retired[:] = [
            s for s in self.retired if not (s.done.is_set() and s.cleanup_ok)
        ]

    def start(self, peer_id, sdp):
        if self.closed:
            raise ValueError("dedicated camera service closed")
        if peer_id in self.active:
            slot = self.active[peer_id]
            if slot.sdp != sdp:
                raise ValueError(
                    "changed offer requires peer disconnect and replacement"
                )
            return slot.token
        # Validate size/shape before allocating a thread or retaining the offer.
        command(Generation("check", "check", "check"), 1, "offer", {"sdp": sdp})
        self._reap()
        if len(self.active) + len(self.retired) >= self.maximum:
            raise ValueError("dedicated peer capacity includes retiring workers")
        slot = Slot(peer_id, sdp, seen_ns=time.monotonic_ns())
        self.active[peer_id] = slot
        slot.thread = threading.Thread(
            target=self._run,
            args=(slot,),
            daemon=True,
            name="camera-peer-" + slot.token[:8],
        )
        try:
            slot.thread.start()
        except BaseException:
            self.active.pop(peer_id)
            raise
        return slot.token

    def ice(self, peer_id, index, candidate):
        slot = self.active.get(peer_id)
        if slot is None or slot.stop.is_set() or slot.done.is_set():
            raise ValueError("dedicated peer unavailable")
        request = command(
            Generation("check", "check", "check"),
            1,
            "ice",
            {
                "index": index,
                "candidate": candidate,
            },
        )
        try:
            slot.inbox.put_nowait(request["body"])
        except queue.Full:
            slot.failure = "candidate_queue_full"
            slot.stop.set()
            raise ValueError("dedicated candidate queue full") from None

    def retire(self, peer_id):
        slot = self.active.pop(peer_id, None)
        if slot is not None:
            slot.stop.set()
            self.retired.append(slot)

    def poll(self):
        now = time.monotonic_ns()
        result = []
        for slot in list(self.active.values()):
            if slot.done.is_set() and not slot.stop.is_set() and slot.failure is None:
                slot.failure = "worker_exited"
            # Polling after a main-loop stall cannot revive an expired lease.
            if now - slot.seen_ns > 3 * SECOND or now < slot.seen_ns:
                slot.failure = "camera_poll_stalled"
                slot.stop.set()
            else:
                slot.seen_ns = now
            if slot.failure is not None:
                if not slot.reported:
                    result.append((slot.peer_id, slot.token, "failed", {}, now))
                    slot.reported = True
                continue
            for _ in range(64):
                try:
                    kind, body, received = slot.events.get_nowait()
                except queue.Empty:
                    break
                result.append((slot.peer_id, slot.token, kind, body, received))
        self._reap()
        return result

    def _run(self, slot):
        owner = None
        try:
            owner = slot.owner = self.factory(enabled=True)
            with owner:
                owner.start(
                    self.profile, ice_servers=self.ice_servers, source=self.source
                )
                offered = False
                closing_at = None
                while True:
                    now = time.monotonic_ns()
                    if now < slot.seen_ns or now - slot.seen_ns > 3 * SECOND:
                        slot.failure = "camera_poll_stalled"
                        slot.stop.set()
                    if slot.stop.is_set() and closing_at is None:
                        if owner.state in ("starting", "ready", "answering", "playing"):
                            owner.shutdown()
                        closing_at = now + 2500000000
                    if closing_at is None:
                        if owner.state == "ready" and not offered:
                            owner.offer(slot.sdp)
                            offered = True
                        # Limit outstanding requests and return to supervisor polling.
                        for _ in range(8):
                            if len(owner.pending) >= 24:
                                break
                            try:
                                body = slot.inbox.get_nowait()
                            except queue.Empty:
                                break
                            owner.ice(body["index"], body["candidate"])
                    for message in owner.poll():
                        if (
                            message["kind"] in ("answer", "ice", "snapshot")
                            and not slot.stop.is_set()
                        ):
                            slot.events.put_nowait(
                                (message["kind"], message["body"], time.monotonic_ns())
                            )
                    if owner.state == "failed":
                        raise ValueError("dedicated peer failed")
                    if owner.state == "closed" or (
                        closing_at is not None and now > closing_at
                    ):
                        break
                    slot.stop.wait(0.01) if closing_at is None else time.sleep(0.01)
        except Exception:  # noqa: BLE001 -- fixed status only, cleanup is owned below
            slot.failure = "worker_failed"
        finally:
            try:
                slot.cleanup_ok = owner is None or owner.close()
            except Exception:  # noqa: BLE001 -- retain slot/capacity when cleanup fails
                slot.cleanup_ok = False
            if not slot.cleanup_ok:
                slot.failure = "cleanup_failed"
            slot.done.set()

    def close(self):
        self.closed = True
        for peer_id in list(self.active):
            self.retire(peer_id)
        deadline = time.monotonic() + 6
        for slot in self.retired:
            slot.thread.join(max(0, deadline - time.monotonic()))
        self._reap()
        return not self.retired
