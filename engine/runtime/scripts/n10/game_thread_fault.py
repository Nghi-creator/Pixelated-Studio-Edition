"""Fixture-only thread-exit launcher and owned-game fault driver; no production hook."""

import json
import os
import runpy
import stat
import subprocess
import sys
import threading
import time
from dataclasses import asdict
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fault_cost import FaultCostAcceptance

METHOD = "n10-contained-controller-thread-exit-cost-v1"
MODE = "engineering-game-controller-thread-exit-cost"
CASE = "controller-thread-exit"
TRIGGER = "thread-exit-trigger.json"
OBSERVATION = "thread-exit-observation.json"


def read_marker(path):
    from live_probe_control.browser_game_worker import strict_object

    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, "rb") as source:
        info = os.fstat(source.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid():
            raise ValueError("owned regular thread-fault marker required")
        data = source.read(4097)
    if len(data) > 4096:
        raise ValueError("thread-fault marker bound")
    return json.loads(data, object_pairs_hook=strict_object)


def write_marker(path, value):
    pending = path.with_name(path.name + ".pending")
    with pending.open("x") as target:
        target.write(json.dumps(value, allow_nan=False))
    try:
        # Publish complete bytes atomically without replacing an existing marker.
        os.link(pending, path, follow_symlinks=False)
    finally:
        pending.unlink()


def peer_subprocess_proxy():
    """Replace only the fixture supervisor's launcher, preserving real Popen types."""
    original = subprocess.Popen
    helper = str(Path(__file__).resolve())

    def launch(argv, **kwargs):
        if argv != [
            sys.executable,
            "-u",
            "-m",
            "live_probe_control.peer_worker",
            "--dedicated-peer-worker",
        ]:
            raise ValueError("exact dedicated fixture worker command required")
        code = "import runpy; runpy.run_path(" + repr(helper) + ", run_name='__main__')"
        return original(
            [sys.executable, "-u", "-c", code, "--dedicated-peer-worker"], **kwargs
        )

    return SimpleNamespace(
        Popen=launch, PIPE=subprocess.PIPE, TimeoutExpired=subprocess.TimeoutExpired
    )


def child_main():
    if sys.argv[1:] != ["--dedicated-peer-worker"]:
        raise ValueError("explicit disposable peer worker required")
    from live_probe_control.peer_control import PeerControl, WorkerProbePort

    original_snapshot, original_poll = WorkerProbePort.snapshot, PeerControl.poll

    def snapshot(port):
        value = original_snapshot(port)
        if (
            threading.current_thread().name == "peer-cadence-control"
            and port.media.bootstrap["body"]["source"] == "isolated_game"
            and value.healthy
            and value.configured_fps == value.negotiated_fps == 24
        ):
            directory = Path(port.media.bootstrap["body"]["control"]["directory"])
            try:
                marker = read_marker(directory / TRIGGER)
            except FileNotFoundError:
                return value
            if marker == dict(method=METHOD, request=asdict(port.request)):
                port._thread_fault = dict(
                    method=METHOD,
                    request=asdict(port.request),
                    injected_at_ns=time.monotonic_ns(),
                    before_buffers=port.last_native["encoded_buffers"],
                )
                raise SystemExit()  # Only the controller thread exits; media/IPC stay alive.
        return value

    def poll(control):
        original_poll(control)
        port = control.port
        fault = getattr(port, "_thread_fault", None)
        if (
            fault is None
            or control.thread.is_alive()
            or getattr(port, "_thread_fault_reported", False)
        ):
            return
        native = control.media.snapshot()
        if (
            native["configured_fps"] == native["negotiated_fps"] == 24
            and native["encoded_buffers"] > fault["before_buffers"]
        ):
            write_marker(
                Path(control.config.directory) / OBSERVATION,
                dict(
                    **fault,
                    observed_at_ns=time.monotonic_ns(),
                    after_buffers=native["encoded_buffers"],
                    configured_fps=24,
                    negotiated_fps=24,
                    control_thread_alive=False,
                ),
            )
            port._thread_fault_reported = True

    with (
        patch.object(WorkerProbePort, "snapshot", snapshot),
        patch.object(PeerControl, "poll", poll),
    ):
        runpy.run_module("live_probe_control.peer_worker", run_name="__main__")


class ControllerThreadExitCost(FaultCostAcceptance):
    method = cost_method = METHOD
    unresolved_journal_state = "active"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.case = CASE
        self.thread_observed = False

    def inject_fault(self):
        if (
            self.old_process is not self.old.owner.child
            or self.old_process.poll() is not None
        ):
            raise ValueError("exact live worker required for thread fault")
        write_marker(
            Path(self.local.directory) / TRIGGER,
            dict(method=METHOD, request=asdict(self.draft.request)),
        )

    def tick(self):
        if self.stage == "result" and not self.thread_observed:
            try:
                value = read_marker(Path(self.local.directory) / OBSERVATION)
            except FileNotFoundError:
                pass
            else:
                if (
                    set(value)
                    != {
                        "method",
                        "request",
                        "injected_at_ns",
                        "observed_at_ns",
                        "before_buffers",
                        "after_buffers",
                        "configured_fps",
                        "negotiated_fps",
                        "control_thread_alive",
                    }
                    or value["method"] != METHOD
                    or value["request"] != asdict(self.draft.request)
                    or value["control_thread_alive"] is not False
                    or value["configured_fps"] != 24
                    or value["negotiated_fps"] != 24
                    or not 0 < value["injected_at_ns"] < value["observed_at_ns"]
                    or not 0 < value["before_buffers"] < value["after_buffers"]
                ):
                    raise ValueError("thread-fault progress observation mismatch")
                self.emit(
                    "controller_thread_exit_observed", **value, live_authority=False
                )
                self.thread_observed = True
        return super().tick()

    def result_extra(self):
        if not self.thread_observed or self.operation.result is not None:
            raise ValueError("thread-only exit and progress were not observed")
        return {"operation_status": self.operation.status}


if __name__ == "__main__":
    child_main()
