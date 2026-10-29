"""Opt-in contained test host. Real camera/socket/media; local hooks never exposed on the network."""

import faulthandler
import json
import os
import runpy
import signal
import subprocess
import sys
import tempfile
import threading
import time
from contextlib import ExitStack
from pathlib import Path
from unittest.mock import patch

ACCEPTANCE_PROFILE = {"id": "balanced", "fps": 30, "bitrateKbps": 1500}

RUNTIME = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RUNTIME))


def main():
    if sys.argv[1:] != ["--isolated-browser-acceptance"] or os.environ.get("N10_BROWSER_ACCEPTANCE") != "1":
        raise ValueError("explicit disposable acceptance opt-in required")
    from game_failure_acceptance import MODES as GAME_FAILURE_MODES
    from fault_cost import COST_MODES as FAULT_COST_MODES
    from live_probe_control.action_cost_protocol import MODES, MODES_V2, MODES_V3
    ACTION_COST_MODES = {**MODES, **MODES_V2, **MODES_V3}

    mode = os.environ.get("N10_BROWSER_ACCEPTANCE_MODE", "production-admission")
    if mode not in ("production-admission", "engineering-complete", "engineering-receiver-loss", "observer-off", "observer-on", "observer-static-diagnostic", "observer-moving-off", "observer-moving-on", "engineering-disturbance", "engineering-game-disturbance", *GAME_FAILURE_MODES, *FAULT_COST_MODES, *ACTION_COST_MODES):
        raise ValueError("closed acceptance mode required")
    fault_cost = mode in FAULT_COST_MODES
    game_failure = mode in GAME_FAILURE_MODES or fault_cost
    cost_mode = mode in ACTION_COST_MODES
    game_control = mode == "engineering-game-disturbance" or game_failure or cost_mode
    control_mode = mode in ("engineering-disturbance", "engineering-game-disturbance") or cost_mode
    moving_mode = mode in ("observer-moving-off", "observer-moving-on")
    observer_off = mode in ("observer-off", "observer-moving-off")
    diagnostic_mode = mode == "observer-static-diagnostic"
    screen_mode = mode in ("observer-off", "observer-on") or diagnostic_mode or moving_mode or control_mode
    import gi
    import socketio
    from observer_native_screen import NativeScreen

    gi.require_version("GLib", "2.0")
    from gi.repository import GLib
    from live_probe_control.camera_workers import CameraWorkers
    from live_probe_control.contracts import Policy
    from live_probe_control.controller import GRACE_NS
    from live_probe_control.game_scene import GameScene
    from live_probe_control.journal import CadenceJournal
    from live_probe_control.local_owner import LocalProbeOwner
    from live_probe_control.probe_transport import EngineeringControl
    from live_probe_control.receiver_bridge import BrowserReceiverBridge

    captured, state = {}, {"phase": "startup", "scopes": {}, "failure": None}
    origin = time.monotonic()

    def emit(kind, **values):
        print("N10_ACCEPTANCE " + json.dumps({"kind": kind, **values}), flush=True)

    with ExitStack() as cleanup:
        def finish_container_cost():
            if state.get("container_cost"):
                service = captured.get("workers")
                state["container_cost"].finish(scene_closed=state.get("scene_closed", False),
                    pulse_reaped=pulse.poll() is not None, workers_closed=bool(service and service.closed),
                    active_peers=len(service.active) if service else -1)
        cleanup.callback(finish_container_cost)
        scene = GameScene(defer_script=moving_mode or cost_mode)
        def close_scene():
            emit("host_shutdown", stage="scene_close_start")
            if not scene.close():
                raise ValueError("owned game/display cleanup unconfirmed")
            state["scene_closed"] = True
            emit("host_shutdown", stage="scene_closed")
        cleanup.callback(close_scene)
        original_popen = subprocess.Popen

        def private_x99(argv, *args, **kwargs):
            if argv[0] == "/usr/bin/Xvfb":
                argv = [argv[0], ":99", *argv[1:]]
            return original_popen(argv, *args, **kwargs)

        with patch("live_probe_control.game_scene.subprocess.Popen", side_effect=private_x99):
            scene.start()
        if scene.number != 99:
            raise ValueError("owned production display mismatch")
        directory = cleanup.enter_context(tempfile.TemporaryDirectory())
        cleanup.enter_context(patch.dict(os.environ, {
            "PULSE_SERVER": "127.0.0.1", "XDG_RUNTIME_DIR": directory,
            "XDG_CONFIG_HOME": directory + "/config", "PIXELATED_DEDICATED_PEER_WORKERS": "1",
            "PIXELATED_RECEIVER_OBSERVATIONS": "0" if observer_off else "1", "PIXELATED_MAX_STREAM_PEERS": "3",
            "PIXELATED_SESSION_ID": "native_acceptance", "PIXELATED_STREAM_PROFILE": json.dumps(ACCEPTANCE_PROFILE),
            "PIXELATED_CAMERA_PEER_STATE_PATH": directory + "/peers.json",
            "PIXELATED_CAMERA_TELEMETRY_STATE_PATH": directory + "/telemetry.json",
        }))
        pulse = subprocess.Popen([
            "pulseaudio", "--daemonize=no", "--exit-idle-time=-1", "--disable-shm=yes",
            "--use-pid-file=no", "--log-level=error", "--load=module-native-protocol-tcp auth-anonymous=1",
        ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        cleanup.callback(lambda: pulse.wait(timeout=3))
        cleanup.callback(lambda: pulse.terminate() if pulse.poll() is None else None)
        deadline = time.monotonic() + 3
        while time.monotonic() < deadline:
            ready = subprocess.run(["pactl", "list", "short", "sources"], capture_output=True, timeout=1, check=False)
            if ready.returncode == 0 and b"auto_null.monitor" in ready.stdout:
                break
            time.sleep(0.05)
        else:
            raise ValueError("owned Pulse monitor unavailable")

        original_workers = CameraWorkers.__init__
        original_bridge = BrowserReceiverBridge.__init__
        original_connect = socketio.Client.connect

        def workers_init(instance, *args, **kwargs):
            if mode.startswith("engineering-"):
                kwargs.update(source="isolated_game" if game_control else "isolated_synthetic",
                              control=EngineeringControl.open(ledger, policy, scene=scene if game_control else None))
            original_workers(instance, *args, **kwargs)
            captured["workers"] = instance

        def bridge_init(instance, *args, **kwargs):
            original_bridge(instance, *args, **kwargs)
            captured["bridge"] = instance

        def camera_connect(instance, *args, **kwargs):
            captured["client"] = instance
            return original_connect(instance, *args, **kwargs)

        ledger = cleanup.enter_context(tempfile.TemporaryDirectory())
        policy = Policy(24, 60, (5 if control_mode else 2) * 10**9, 3, 12 * 10**9, 10**9, 20, 100000000)

        def step():
            try:
                if not (state.get("diagnostic") and state["diagnostic"].frozen):
                    scene.tick()
                if time.monotonic() - origin > (30 if diagnostic_mode else 26):
                    raise ValueError("integrated acceptance deadline: " + state["phase"])
                service, bridge = captured.get("workers"), captured.get("bridge")
                if service is None or (bridge is None and not observer_off):
                    return True
                if state["phase"] == "startup":
                    if not observer_off:
                        state["local"] = cleanup.enter_context(LocalProbeOwner(service, ledger, policy, enabled=True))
                        state["capability"] = state["local"].claim()
                    state["phase"] = "game-failure" if game_failure else ("control-screen" if control_mode else ("observer-diagnostic" if diagnostic_mode else ("observer-warmup" if screen_mode else "admission")))
                    if mode in MODES_V3 or fault_cost:
                        from container_cost import ContainerCost
                        state["container_cost"] = ContainerCost(emit)
                    emit("camera_ready", mode=mode, source=service.source, profile=service.profile)
                local, capability = state.get("local"), state.get("capability")
                if state["phase"] == "game-failure":
                    if "game_failure" not in state:
                        from game_failure_acceptance import GameFailureAcceptance
                        if fault_cost:
                            from fault_cost import FaultCostAcceptance
                            state["game_failure"] = FaultCostAcceptance(service, scene, bridge, local, capability, emit, captured["client"], FAULT_COST_MODES[mode], container_cost=state["container_cost"])
                        else:
                            state["game_failure"] = GameFailureAcceptance(service, scene, bridge, local, capability, emit, captured["client"], mode)
                        cleanup.callback(state["game_failure"].close)
                    if not state["game_failure"].tick():
                        return True
                    state["old"] = state["game_failure"].old
                    state["slots"] = list(service.active.values())
                    state["phase"] = "disconnected"
                    state["disconnect_thread"] = threading.Thread(target=captured["client"].disconnect, daemon=True)
                    state["disconnect_thread"].start()
                    return True
                if state["phase"] == "control-screen":
                    if "control_screen" not in state:
                        from control_disturbance import (
                            ControlDisturbance,
                            GameControlDisturbance,
                        )
                        if cost_mode:
                            from action_cost import GameActionCost
                            if mode in MODES_V3:
                                from action_span import GameActionSpan
                                state["control_screen"] = GameActionSpan(service, scene, bridge, local, capability, emit,
                                    condition=ACTION_COST_MODES[mode], pulse=pulse, container_cost=state["container_cost"],
                                    inject_failure=mode == "engineering-game-action-span-failure")
                            else:
                                state["control_screen"] = GameActionCost(service, scene, bridge, local, capability, emit,
                                                                      condition=ACTION_COST_MODES[mode],
                                                                      version="v2" if mode in MODES_V2 else "v1")
                        else:
                            screen_class = GameControlDisturbance if game_control else ControlDisturbance
                            state["control_screen"] = screen_class(service, scene, bridge, local, capability, emit)
                    if not state["control_screen"].tick():
                        return True
                    state["slots"] = list(service.active.values())
                    state["phase"] = "disconnected"
                    state["disconnect_thread"] = threading.Thread(target=captured["client"].disconnect, daemon=True)
                    state["disconnect_thread"].start()
                    return True
                if state["phase"] == "observer-diagnostic":
                    if "diagnostic" not in state:
                        from observer_static_diagnostic import ObserverStaticDiagnostic
                        state["diagnostic"] = ObserverStaticDiagnostic(service, scene, bridge, local, capability, emit, captured["client"])
                        cleanup.callback(state["diagnostic"].close)
                    if not state["diagnostic"].tick():
                        return True
                    if (Path(ledger) / "journal.json").exists():
                        raise ValueError("diagnostic created action journal")
                    state["slots"] = list(service.active.values())
                    state["phase"] = "disconnected"
                    state["disconnect_thread"] = threading.Thread(target=captured["client"].disconnect, daemon=True)
                    state["disconnect_thread"].start()
                    return True
                if state["phase"] == "observer-warmup" and moving_mode:
                    from observer_moving_gate import MovingObserverGate
                    if "moving_gate" not in state:
                        state["moving_gate"] = MovingObserverGate(scene, emit)
                    slots = [service.active.get(peer) for peer in ("first", "second")]
                    ready = all(slot is not None and slot.owner is not None and slot.owner.last_snapshot
                                and slot.owner.last_snapshot["connection_state"] == "connected"
                                and slot.owner.last_snapshot["encoded_buffers"] > 0
                                and slot.owner.last_observation is not None
                                and 0 <= time.monotonic_ns() - slot.owner.last_observation[1] <= 1500000000 for slot in slots)
                    if ready and not observer_off:
                        for peer, slot in zip(("first", "second"), slots, strict=True):
                            record = bridge.records.get(peer)
                            if record is None or not record.receiver_socket_id:
                                ready = False
                                continue
                            if peer not in state["scopes"]:
                                state["scopes"][peer] = bridge.attach(local, capability, peer, slot.token)
                        ready = ready and len(state["scopes"]) == 2 and all(
                            local.inspect(scope)["status"] == "ready_for_dry_run" for scope in state["scopes"].values())
                    if not state["moving_gate"].tick(ready):
                        return True
                    state["screen"] = NativeScreen(service, scene, record_phase=True)
                    state["phase"] = "observer-measuring"
                    emit("screen_started")
                if state["phase"] == "observer-warmup":
                    slots = [service.active.get(peer_id) for peer_id in ("first", "second")]
                    if any(slot is None or slot.owner is None or slot.owner.last_snapshot is None for slot in slots):
                        return True
                    if any(slot.owner.last_snapshot["connection_state"] != "connected" or not slot.owner.last_snapshot["encoded_buffers"] for slot in slots):
                        return True
                    if mode == "observer-on":
                        for peer_id, slot in zip(("first", "second"), slots, strict=True):
                            record = bridge.records.get(peer_id)
                            if record is None or not record.receiver_socket_id:
                                return True
                            if peer_id not in state["scopes"]:
                                state["scopes"][peer_id] = bridge.attach(local, capability, peer_id, slot.token)
                    state.setdefault("warmup_start", time.monotonic_ns())
                    if time.monotonic_ns() - state["warmup_start"] < 3 * 10**9:
                        return True
                    if mode == "observer-on" and any(local.inspect(scope)["status"] != "ready_for_dry_run" for scope in state["scopes"].values()):
                        raise ValueError("observer local admission unavailable after fixed warmup")
                    state["screen"] = NativeScreen(service, scene)
                    state["phase"] = "observer-measuring"
                    emit("screen_started")
                if state["phase"] == "observer-measuring":
                    if not state["screen"].sample():
                        return True
                    if (Path(ledger) / "journal.json").exists():
                        raise ValueError("read-only screen created action journal")
                    emit("screen_native", **state["screen"].report())
                    if moving_mode:
                        emit("moving_phase", **state["moving_gate"].report())
                    state["slots"] = list(service.active.values())
                    state["phase"] = "disconnected"
                    state["disconnect_thread"] = threading.Thread(target=captured["client"].disconnect, daemon=True)
                    state["disconnect_thread"].start()
                    return True
                required = ("first", "second") if state["phase"] == "admission" else ("replacement", "second")
                if state["phase"] in ("admission", "replacement"):
                    for peer_id in required:
                        record = bridge.records.get(peer_id)
                        if peer_id not in state["scopes"] and record and record.receiver_socket_id:
                            slot = service.active.get(peer_id)
                            if slot is not None:
                                state["scopes"][peer_id] = bridge.attach(local, capability, peer_id, slot.token)
                    if not all(peer_id in state["scopes"] and local.inspect(state["scopes"][peer_id])["status"] == "ready_for_dry_run" for peer_id in required):
                        return True
                    if state["phase"] == "admission":
                        duration = 2 * 10**9 if mode == "engineering-receiver-loss" else 10**9
                        draft = local.prepare(capability, state["scopes"]["first"], "browser-native-request", 24, duration)
                        if draft.dispatch_available or draft.budget_reserved or draft.live_authority or (Path(ledger) / "journal.json").exists():
                            raise ValueError("production admission granted mutation authority")
                        state["duration"] = duration
                        state["draft"], state["old"] = draft, service.active["first"]
                        state["sibling_before"] = service.active["second"].owner.last_snapshot["encoded_buffers"]
                        state["game_before"] = scene.resources()["cpu_ticks"]
                        emit("admitted", live_authority=False, budget_reserved=False)
                        if mode == "production-admission":
                            try:
                                local.dispatch(capability, draft)
                            except ValueError as exc:
                                if "explicit contained engineering configuration required" not in str(exc):
                                    raise ValueError("production dispatch rejected for an unrelated reason") from exc
                            else:
                                raise ValueError("production worker accepted controller dispatch")
                            signal.pidfd_send_signal(state["old"].owner.pidfd, signal.SIGKILL)
                            state["phase"] = "replacement"
                        else:
                            state["operation"] = local.dispatch(capability, draft)
                            if local.dispatch(capability, draft) is not state["operation"]:
                                raise ValueError("dispatch retry created another operation")
                            state["phase"] = "probe"
                    else:
                        if service.active["replacement"].token == state["old"].token:
                            raise ValueError("replacement reused worker token")
                        try:
                            local.recheck(capability, state["draft"])
                        except ValueError:
                            pass
                        else:
                            raise ValueError("old draft survived worker death")
                        try:
                            local.inspect(state["scopes"]["first"])
                        except ValueError:
                            pass
                        else:
                            raise ValueError("retired receiver capability survived worker death")
                        if service.active["second"].owner.last_snapshot["encoded_buffers"] <= state["sibling_before"]:
                            raise ValueError("sibling source stopped")
                        if scene.resources()["cpu_ticks"] <= state["game_before"] or scene.game.poll() is not None:
                            raise ValueError("owned game did not survive")
                        if mode != "production-admission":
                            with CadenceJournal(ledger) as store:
                                journal = store.journal
                            if journal["actions"] != 1 or journal["reserved_ns"] != state["duration"] + GRACE_NS:
                                raise ValueError("replacement reset durable action budget")
                            if mode == "engineering-receiver-loss":
                                try:
                                    local.prepare(capability, state["scopes"]["replacement"], "after-dirty-replacement", 24, 10**9)
                                except ValueError as exc:
                                    if "dirty owner/session ledger" not in str(exc):
                                        raise ValueError("replacement rejected for an unrelated reason") from exc
                                else:
                                    raise ValueError("replacement bypassed dirty intent")
                        emit("replacement_admitted", old_draft_rejected=True, sibling_progress=True, game_progress=True)
                        state["slots"] = list(service.active.values())
                        state["phase"] = "disconnected"
                        # Socket teardown can wait for its transport reader. Inject
                        # from a socket-side thread, as real transport loss does;
                        # never block the GLib owner lease with a test action.
                        state["disconnect_thread"] = threading.Thread(target=captured["client"].disconnect, daemon=True)
                        state["disconnect_thread"].start()
                elif state["phase"] == "probe":
                    operation = state["operation"]
                    slot = state["old"]
                    snapshot = slot.owner.last_snapshot
                    if mode == "engineering-receiver-loss" and not state.get("loss_requested") and snapshot and snapshot["configured_fps"] == 24:
                        state["loss_requested"] = True
                        emit("stop_first_observations")
                    if not operation.done.is_set():
                        return True
                    result = operation.result
                    if result is None or result.live_authority:
                        raise ValueError("missing or authoritative engineering result")
                    with CadenceJournal(ledger) as store:
                        journal = store.journal
                    if mode == "engineering-complete":
                        if result.outcome != "completed" or result.restoration != "verified_by_port" or journal["state"] != "clean":
                            raise ValueError("integrated action did not complete with verified restoration")
                        signal.pidfd_send_signal(slot.owner.pidfd, signal.SIGKILL)
                    elif result.restoration != "unknown" or journal["state"] != "dirty" or not state.get("loss_requested"):
                        raise ValueError("receiver loss did not retain uncertain restoration/dirty intent")
                    emit("probe_finished", outcome=result.outcome, restoration=result.restoration, ledger_state=journal["state"], live_authority=False)
                    state["phase"] = "replacement"
                elif state["phase"] == "disconnected":
                    if service.active or not all(slot.done.is_set() for slot in state["slots"]):
                        return True
                    if not all(slot.cleanup_ok and slot.owner.exit_code == 0 for slot in state["slots"]):
                        raise ValueError("graceful disconnect cleanup unavailable: " + json.dumps([
                            {"peer": slot.peer_id, "cleanup": slot.cleanup_ok, "failure": slot.failure,
                             "state": slot.owner.state, "reason": slot.owner.reason, "exit": slot.owner.exit_code,
                             "reply": slot.owner.closed_reply} for slot in state["slots"]
                        ]))
                    if not screen_mode and (not state["old"].done.is_set() or not state["old"].cleanup_ok):
                        raise ValueError("failed worker not reaped")
                    state["phase"] = "complete"
                    emit("complete", live_authority=False, worker_cleanup=True, game_alive=scene.game.poll() is None)
                    state["timer_finished"] = True
                    os.kill(os.getpid(), signal.SIGTERM)
                    return False
                return True
            except Exception as exc:  # noqa: BLE001 -- fail the owned acceptance run, never repair observations
                state["failure"] = type(exc).__name__ + ": " + str(exc)
                if state.get("diagnostic"):
                    emit("diagnostic_trace", **state["diagnostic"].trace())
                emit("failed", reason=state["failure"])
                state["timer_finished"] = True
                os.kill(os.getpid(), signal.SIGTERM)
                return False

        timer = GLib.timeout_add(25, step)
        try:
            with patch.object(CameraWorkers, "__init__", workers_init), patch.object(BrowserReceiverBridge, "__init__", bridge_init), patch.object(socketio.Client, "connect", camera_connect):
                runpy.run_path(str(RUNTIME / "camera.py"), run_name="__main__")
                emit("host_shutdown", stage="camera_loop_returned")
        finally:
            if state.get("disconnect_thread"):
                state["disconnect_thread"].join(timeout=3)
                if state["disconnect_thread"].is_alive():
                    state["failure"] = "injected signaling disconnect did not finish"
            emit("host_shutdown", stage="disconnect_thread_joined")
            if captured.get("client"):
                captured["client"].disconnect()
            emit("host_shutdown", stage="socket_closed")
            if state["phase"] not in ("complete",) and not state["failure"]:
                state["failure"] = "camera exited before acceptance completion"
            if not state.get("timer_finished"):
                GLib.source_remove(timer)
        if state["failure"]:
            raise ValueError(state["failure"])

    emit("host_shutdown", stage="scope_closed")


if __name__ == "__main__":
    # Disposable harness diagnosis only: leave stacks before the outer 42s kill.
    faulthandler.enable()
    faulthandler.dump_traceback_later(35)
    # Keep the dump armed through interpreter shutdown too: main() can return
    # while a non-daemon dependency thread still prevents process exit.
    main()
