"""Contained game lifecycle failures; no inbound fault/control network handler."""

import os
import socket
import time
import uuid
from dataclasses import asdict

from control_disturbance import GameControlDisturbance
from failure_lifetime import observe
from live_probe_control.contained_capture import (
    SOCKET,
    GameCaptureContext,
    socket_identity,
)
from live_probe_control.controller import GRACE_NS
from live_probe_control.journal import CadenceJournal
from live_probe_control.local_owner import LocalProbeOwner

METHOD = "n10-contained-game-failure-v1"
MODES = {"engineering-game-cancel": "cancel", "engineering-game-receiver-loss": "receiver-loss",
         "engineering-game-source-loss": "source-loss", "engineering-game-reconnect": "reconnect"}
ORDER = ("engineering-game-disturbance", *MODES)


class SourceSocketSwap:
    """Temporarily replace only an exact owned fixture socket; never signal X/game."""

    def __init__(self, scene, capture):
        if capture != GameCaptureContext.from_scene(scene):
            raise ValueError("fault requires exact owned scene")
        self.original = (capture.socket_device, capture.socket_inode)
        if socket_identity() != self.original:
            raise ValueError("fault source identity already changed")
        self.backup = SOCKET.with_name("n10-" + uuid.uuid4().hex)
        if self.backup.exists():
            raise ValueError("fault backup already exists")
        self.moved, self.replacement, self.replacement_identity = False, None, None
        try:
            os.rename(SOCKET, self.backup)
            self.moved = True
            self.replacement = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
            self.replacement.bind(str(SOCKET))
            self.replacement_identity = socket_identity()
            if self.replacement_identity == self.original:
                raise ValueError("fault did not change socket identity")
        except BaseException:
            self.close()
            raise

    def close(self):
        if not self.moved:
            return
        if self.replacement_identity is not None:
            if socket_identity() != self.replacement_identity:
                raise ValueError("fault cleanup socket identity changed")
            SOCKET.unlink()
        elif SOCKET.exists():
            raise ValueError("fault cleanup encountered unknown socket")
        if self.replacement is not None:
            self.replacement.close()
            self.replacement = None
        os.rename(self.backup, SOCKET)
        self.moved = False
        if socket_identity() != self.original:
            raise ValueError("original owned socket restoration unconfirmed")


class GameFailureAcceptance(GameControlDisturbance):
    method = METHOD

    def __init__(self, service, scene, bridge, local, capability, emit, sio, mode):
        if mode not in MODES:
            raise ValueError("closed contained-game failure case required")
        super().__init__(service, scene, bridge, local, capability, emit)
        self.case, self.sio = MODES[mode], sio
        self.old = self.draft = self.old_receiver = self.swap = None
        self.restart_owner = None
        self.faulted_at = None
        self.source_restored = False
        self.sibling_before = self.game_before = self.sibling_identity = None
        self.duration = 2 * 10**9
        self.issuer_epoch, self.admission_outcomes = 1, {}
        self.old_process = self.old_process_hash = None

    def journal(self):
        with CadenceJournal(self.local.directory) as store:
            value = store.journal
        if value is None or value["actions"] != 1 or value["reserved_ns"] != self.duration + GRACE_NS:
            raise ValueError("failure case lost durable reservation")
        expected = "clean" if self.case == "cancel" else "dirty"
        if value["state"] != expected:
            raise ValueError("failure case journal state mismatch")
        return value

    def restore_source(self):
        if self.swap is not None and not self.source_restored:
            self.swap.close()
            self.source_restored = True
            self.emit("game_failure_source_restored", method=METHOD, case=self.case)

    def reconnect(self):
        self.emit("game_failure_reconnect", method=METHOD, case=self.case)

    def begin_restart(self, slots, now):
        self.journal()
        for name, call in (("retired_draft", lambda: self.local.recheck(self.capability, self.draft)),
                           ("retired_receiver", lambda: self.local.inspect(self.old_receiver))):
            try:
                call()
            except ValueError:
                self.admission_outcomes[name] = "rejected"
            else:
                raise ValueError("retired draft/receiver survived replacement")
        if slots["replacement"].token == self.old.token:
            raise ValueError("replacement reused old worker identity")
        observe(self, "replacement_ready", slots)
        prior_owner, prior_capability = self.local, self.capability
        prior_owner.close()
        for peer in slots:
            self.bridge.retire(peer)
        self.restart_owner = LocalProbeOwner(self.service, prior_owner.directory, prior_owner.policy, enabled=True)
        self.local = self.restart_owner.__enter__()
        self.capability = self.local.claim()
        self.issuer_epoch += 1
        self.prior_capability = prior_capability
        self.scopes = {}
        for peer in slots:
            self.sio.emit("webrtc-receiver-bind", self.bridge.open(peer))
        self.stage, self.stage_start = "restarted-owner", now

    def tick(self):
        now = time.monotonic_ns()
        if self.swap is not None and not self.source_restored and now - self.faulted_at >= 500000000:
            self.restore_source()
        if self.stage in ("eligibility", "warmup"):
            slots = self.slots()
            if slots is None:
                if self.stage != "eligibility" or now - self.origin > 8 * 10**9:
                    raise ValueError("game failure eligibility lost/deadline")
                return False
            if self.stage == "eligibility":
                if now - self.origin > 8 * 10**9:
                    raise ValueError("game failure eligibility deadline")
                if self.ready(slots) and self.target_ready(slots, 30):
                    self.stage, self.stage_start = "warmup", now
            elif not self.ready(slots) or not self.target_ready(slots, 30):
                raise ValueError("game failure fixed warmup readiness lost")
            elif now - self.stage_start >= 3 * 10**9:
                self.old, self.old_receiver = slots["first"], self.scopes["first"]
                self.sibling_before = slots["second"].owner.last_observation[0]["encoded_buffers"]
                self.sibling_identity = self.identity({"second": slots["second"]})["second"]
                self.game_before = self.scene.resources()["cpu_ticks"]
                self.draft = self.local.prepare(self.capability, self.old_receiver, "game-failure-request", 24, self.duration)
                self.operation = self.local.dispatch(self.capability, self.draft)
                if self.local.dispatch(self.capability, self.draft) is not self.operation:
                    raise ValueError("failure retry issued another operation")
                self.stage, self.stage_start = "active", now
                self.emit("game_failure_dispatched", method=METHOD, case=self.case, request=asdict(self.draft.request), live_authority=False)
            return False
        if self.stage == "active":
            if now - self.stage_start > 2 * 10**9 or self.operation.done.is_set():
                raise ValueError("fault missed the active target")
            snapshot = self.old.owner.last_snapshot
            if snapshot and snapshot["configured_fps"] == snapshot["negotiated_fps"] == 24:
                self.old_process = self.old.owner.child
                observed = observe(self, "active_target", {"first": self.old, "second": self.slots()["second"]})
                self.old_process_hash = observed["peers"]["first"]["process"]["identity_hash"]
                self.faulted_at = now
                if self.case == "cancel":
                    self.local.cancel(self.capability, self.operation)
                elif self.case == "receiver-loss":
                    self.emit("stop_first_observations")
                elif self.case == "source-loss":
                    self.swap = SourceSocketSwap(self.scene, self.service.control.capture)
                else:
                    self.reconnect()
                self.emit("game_failure_fault", method=METHOD, case=self.case, target_observed=True)
                self.stage = "result"
            return False
        if self.stage == "result":
            if not self.operation.done.is_set():
                return False
            self.restore_source()
            result = self.operation.result
            if self.case == "cancel":
                if result is None or (result.outcome, result.restoration, result.reason) != ("aborted", "verified_by_port", "cancelled"):
                    raise ValueError("cancel did not verify restoration")
            elif result is not None and (result.restoration != "unknown" or result.live_authority):
                raise ValueError("fault incorrectly claimed verified restoration")
            if self.case == "source-loss" and result is None:
                raise ValueError("source loss lacked explicit uncertain restoration result")
            journal = self.journal()
            self.emit("game_failure_result", method=METHOD, case=self.case,
                      result=asdict(result) if result is not None else None, ledger_state=journal["state"],
                      actions=journal["actions"], reserved_ns=journal["reserved_ns"])
            if self.case == "cancel":
                self.reconnect()
            self.stage = "replacement"
        if self.stage == "replacement":
            slots = self.slots(("replacement", "second"))
            if slots is None or not self.old.done.is_set() or not self.ready(slots):
                return False
            if not self.old.cleanup_ok or type(self.old.owner.exit_code) is not int or (self.case == "cancel" and self.old.owner.exit_code != 0) or (self.case != "cancel" and self.old.owner.exit_code != -9):
                raise ValueError("old exact worker teardown unavailable")
            self.begin_restart(slots, now)
            return False
        if self.stage == "restarted-owner":
            slots = self.slots(("replacement", "second"))
            if slots is None or not self.ready(slots):
                return False
            self.stage, self.stage_start = "post-restart", now
        if self.stage == "post-restart":
            slots = self.slots(("replacement", "second"))
            if slots is None or not self.ready(slots):
                raise ValueError("post-restart readiness lost")
            if now - self.stage_start < 2500000000:
                return False
            journal = self.journal()
            try:
                self.local.prepare(self.prior_capability, self.scopes["replacement"], "old-owner-request", 24, 10**9)
            except ValueError as exc:
                if "capability" not in str(exc):
                    raise
                self.admission_outcomes["old_issuer"] = "rejected_capability"
            else:
                raise ValueError("restarted owner accepted old capability")
            try:
                draft = self.local.prepare(self.capability, self.scopes["replacement"], "after-owner-restart", 24, 10**9)
            except ValueError as exc:
                if self.case == "cancel" or "dirty owner/session ledger" not in str(exc):
                    raise
                self.admission_outcomes["new_request"] = "rejected_dirty_ledger"
            else:
                if self.case != "cancel":
                    raise ValueError("restart bypassed dirty ledger")
                if draft.dispatch_available or draft.budget_reserved or draft.live_authority:
                    raise ValueError("read-only restart draft granted authority")
                self.admission_outcomes["new_request"] = "read_only_draft"
            if self.scene.resources()["cpu_ticks"] <= self.game_before or self.scene.game.poll() is not None or self.scene.display.poll() is not None:
                raise ValueError("fault did not preserve owned game/display")
            if self.identity({"second": slots["second"]})["second"] != self.sibling_identity or slots["second"].owner.last_snapshot["encoded_buffers"] <= self.sibling_before:
                raise ValueError("fault stopped sibling source")
            if GameCaptureContext.from_scene(self.scene) != self.service.control.capture:
                raise ValueError("fault did not restore exact capture scope")
            observe(self, "issuer_restarted", slots)
            self.emit("game_failure_verified", method=METHOD, case=self.case, old_exit=self.old.owner.exit_code,
                      old_reaped=True, stale_handles_rejected=True, owner_restarted=True, old_owner_rejected=True,
                      dirty_blocked=self.case != "cancel", clean_draft_allowed=self.case == "cancel",
                      source_restored=self.source_restored, game_progress=True, sibling_progress=True, sibling_identity_retained=True,
                      ledger_state=journal["state"], actions=journal["actions"], reserved_ns=journal["reserved_ns"], live_authority=False)
            self.stage = "done"
            return True
        return False

    def close(self):
        self.restore_source()
        if self.restart_owner is not None:
            self.restart_owner.close()
