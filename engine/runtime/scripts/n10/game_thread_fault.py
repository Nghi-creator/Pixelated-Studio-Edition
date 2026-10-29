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
BLOCK_METHOD = "n10-contained-controller-thread-block-cost-v1"
BLOCK_MODE = "engineering-game-controller-thread-block-cost"
BLOCK_CASE = "controller-thread-block"
BLOCK_TRIGGER = "thread-block-trigger.json"
BLOCK_OBSERVATION = "thread-block-observation.json"


def fault_spec(kind):
    if kind == "exit":
        return METHOD, TRIGGER, OBSERVATION, False
    if kind == "block":
        return BLOCK_METHOD, BLOCK_TRIGGER, BLOCK_OBSERVATION, True
    raise ValueError("closed controller-thread fault kind required")


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


def peer_subprocess_proxy(kind="exit"):
    """Replace only the fixture supervisor's launcher, preserving real Popen types."""
    fault_spec(kind)
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
        code = (
            "import runpy; runpy.run_path("
            + repr(helper)
            + ", init_globals={'FAULT_KIND':"
            + repr(kind)
            + "}, run_name='__main__')"
        )
        return original(
            [sys.executable, "-u", "-c", code, "--dedicated-peer-worker"], **kwargs
        )

    return SimpleNamespace(
        Popen=launch, PIPE=subprocess.PIPE, TimeoutExpired=subprocess.TimeoutExpired
    )


def child_main(kind="exit"):
    method, trigger, observation, alive = fault_spec(kind)
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
                marker = read_marker(directory / trigger)
            except FileNotFoundError:
                return value
            if marker == dict(method=method, request=asdict(port.request)):
                port._thread_fault = dict(
                    method=method,
                    request=asdict(port.request),
                    injected_at_ns=time.monotonic_ns(),
                    before_buffers=port.last_native["encoded_buffers"],
                )
                if alive:
                    # Park only this thread beyond the existing four-second
                    # reservation. No busy spin or watchdog/lease modification.
                    threading.Event().wait(10)
                    raise ValueError("blocked controller outlived independent teardown")
                raise SystemExit()  # Only the controller thread exits; media/IPC stay alive.
        return value

    def poll(control):
        original_poll(control)
        port = control.port
        fault = getattr(port, "_thread_fault", None)
        if (
            fault is None
            or control.thread.is_alive() is not alive
            or getattr(port, "_thread_fault_reported", False)
        ):
            return
        native = control.media.snapshot()
        if (
            native["configured_fps"] == native["negotiated_fps"] == 24
            and native["encoded_buffers"]
            >= fault["before_buffers"] + (3 if alive else 1)
            and time.monotonic_ns() - fault["injected_at_ns"]
            >= (100000000 if alive else 1)
        ):
            write_marker(
                Path(control.config.directory) / observation,
                dict(
                    **fault,
                    observed_at_ns=time.monotonic_ns(),
                    after_buffers=native["encoded_buffers"],
                    configured_fps=24,
                    negotiated_fps=24,
                    control_thread_alive=alive,
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
    fault_case = CASE
    trigger_name = TRIGGER
    observation_name = OBSERVATION
    observation_event = "controller_thread_exit_observed"
    expected_thread_alive = False
    minimum_progress_ns = 1
    minimum_buffers = 1

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.case = self.fault_case
        self.thread_observed = False

    def inject_fault(self):
        if (
            self.old_process is not self.old.owner.child
            or self.old_process.poll() is not None
        ):
            raise ValueError("exact live worker required for thread fault")
        write_marker(
            Path(self.local.directory) / self.trigger_name,
            dict(method=self.method, request=asdict(self.draft.request)),
        )

    def tick(self):
        if self.stage == "result" and not self.thread_observed:
            try:
                value = read_marker(Path(self.local.directory) / self.observation_name)
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
                    or value["method"] != self.method
                    or value["request"] != asdict(self.draft.request)
                    or value["control_thread_alive"] is not self.expected_thread_alive
                    or value["configured_fps"] != 24
                    or value["negotiated_fps"] != 24
                    or not 0
                    < value["injected_at_ns"]
                    <= value["observed_at_ns"] - self.minimum_progress_ns
                    or not 0
                    < value["before_buffers"]
                    <= value["after_buffers"] - self.minimum_buffers
                ):
                    raise ValueError("thread-fault progress observation mismatch")
                self.emit(self.observation_event, **value, live_authority=False)
                self.thread_observed = True
        return super().tick()

    def result_extra(self):
        if not self.thread_observed or self.operation.result is not None:
            raise ValueError("thread-only exit and progress were not observed")
        return {"operation_status": self.operation.status}


class ControllerThreadBlockCost(ControllerThreadExitCost):
    method = cost_method = BLOCK_METHOD
    fault_case = BLOCK_CASE
    trigger_name = BLOCK_TRIGGER
    observation_name = BLOCK_OBSERVATION
    observation_event = "controller_thread_block_observed"
    expected_thread_alive = True
    minimum_progress_ns = 100000000
    minimum_buffers = 3


if __name__ == "__main__":
    child_main(globals().get("FAULT_KIND", "exit"))
