"""External monitor for abrupt death of only the fixture's directly owned camera."""

import json
import os
import select
import signal
import sys
import time
from dataclasses import asdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from container_cost import ContainerCost
from fault_cost import FaultCostAcceptance
from failure_lifetime import journal_read, process_hash
from game_thread_fault import read_marker, write_marker
from live_probe_control import CadenceController, Generation, Request
from live_probe_control.contained_capture import process_identity
from live_probe_control.probe_transport import EngineeringControl

METHOD = "n10-contained-camera-death-cost-v1"
MODE = "engineering-game-camera-death-cost"
ACTORS = ("first", "second", "game", "display", "pulse")


def emit(kind, **values):
    print(
        "N10_ACCEPTANCE " + json.dumps(dict(kind=kind, **values), allow_nan=False),
        flush=True,
    )


def directory_value(value):
    directory = Path(value)
    info = directory.lstat()
    if (
        directory.parent != Path("/tmp")
        or not directory.name.startswith("n10-camera-death-")
        or not directory.is_dir()
        or directory.is_symlink()
        or info.st_uid != os.getuid()
        or info.st_mode & 0o777 != 0o700
    ):
        raise ValueError("private relay-owned camera-death directory required")
    return directory


class CameraDeathCost(FaultCostAcceptance):
    method = cost_method = METHOD

    def __init__(self, *args, pulse, **kwargs):
        super().__init__(*args, **kwargs)
        self.case, self.pulse, self.armed = "camera-death", pulse, False
        self.directory = directory_value(os.environ["N10_CAMERA_DEATH_DIRECTORY"])

    def inject_fault(self):
        children = {
            "first": self.old_process,
            "second": self.slots()["second"].owner.child,
            "game": self.scene.game,
            "display": self.scene.display,
            "pulse": self.pulse,
        }
        pins = {}
        for name, child in children.items():
            parent, start = process_identity(child.pid)
            if child.poll() is not None or parent != os.getpid():
                raise ValueError("direct live camera child required")
            pins[name] = dict(pid=child.pid, start=start)
        write_marker(
            self.directory / "armed.json",
            dict(
                method=METHOD,
                request=asdict(self.draft.request),
                control=self.service.control.wire(),
                processes=pins,
                workers={
                    name: {
                        key: self.slots()[name].owner.last_snapshot[key]
                        for key in (
                            "configured_fps",
                            "negotiated_fps",
                            "width",
                            "height",
                            "target_bitrate",
                            "cpu_used",
                            "max_quantizer",
                            "encoded_buffers",
                        )
                    }
                    for name in ("first", "second")
                },
            ),
        )

    def tick(self):
        if self.stage == "result":
            return False  # The external exact-camera monitor owns fault injection.
        finished = super().tick()
        if self.stage == "result" and not self.armed:
            self.armed = True
            self.emit("camera_death_armed", method=METHOD, live_authority=False)
        return finished


def pin(pid, parent, start=None):
    before = process_identity(pid)
    if before[0] != parent or (start is not None and before[1] != start):
        raise ValueError("owned process lifetime mismatch")
    fd = os.pidfd_open(pid)
    try:
        if process_identity(pid) != before or select.select([fd], [], [], 0)[0]:
            raise ValueError("process lifetime changed while pinning")
    except BaseException:
        os.close(fd)
        raise
    return fd, before[1]


def wait_exit(fd, seconds):
    if not select.select([fd], [], [], seconds)[0]:
        raise ValueError("owned process exit deadline")


def monitor(camera_pid, directory):
    directory = directory_value(directory)
    fds = {}
    camera_fd, camera_start = pin(camera_pid, os.getppid())
    fds["camera"] = camera_fd
    try:
        body = read_marker(directory / "armed.json")
        if (
            set(body) != {"method", "request", "control", "processes", "workers"}
            or body["method"] != METHOD
            or set(body["processes"]) != set(ACTORS)
            or set(body["workers"]) != {"first", "second"}
        ):
            raise ValueError("closed camera-death observation required")
        boot = Path("/proc/sys/kernel/random/boot_id").read_text().strip()
        control = EngineeringControl.from_wire(body["control"])
        if (
            control.capture.owner_pid != camera_pid
            or control.capture.owner_start != camera_start
        ):
            raise ValueError("capture does not belong to the exact camera")
        for name in ("game", "display"):
            if body["processes"][name] != dict(
                pid=getattr(control.capture, name + "_pid"),
                start=getattr(control.capture, name + "_start"),
            ):
                raise ValueError("source actors do not match pinned capture")
        identities = {"camera": process_hash(boot, camera_pid, camera_start)}
        for name in ACTORS:
            actor = body["processes"][name]
            if (
                set(actor) != {"pid", "start"}
                or type(actor["pid"]) is not int
                or type(actor["start"]) is not int
            ):
                raise ValueError("typed actor lifetime required")
            fds[name], start = pin(actor["pid"], camera_pid, actor["start"])
            identities[name] = process_hash(boot, actor["pid"], start)
        if len(set(identities.values())) != 6:
            raise ValueError("actor lifetime collision")
        before = journal_read(control, control.directory)
        projection = before["projection"]
        if (
            projection["state"] != "active"
            or projection["actions"] != 1
            or projection["reserved_ns"] != 4000000000
            or projection["history"][0]["request"] != body["request"]
        ):
            raise ValueError("unresolved exact request required before camera death")
        cost = ContainerCost(lambda *_args, **_kwargs: None)

        def checkpoint(phase):
            emit(
                "camera_death_cost_checkpoint",
                method=METHOD,
                phase=phase,
                sample=cost.sample(),
                live_authority=False,
            )

        emit(
            "camera_death_pinned",
            method=METHOD,
            identities=identities,
            workers=body["workers"],
            journal=before,
            live_authority=False,
        )
        checkpoint("before_camera_kill")
        signal.pidfd_send_signal(camera_fd, signal.SIGKILL)
        wait_exit(camera_fd, 1)
        for name in ("first", "second"):
            wait_exit(fds[name], 3)
        # No signal is sent to either media worker. Their independent guards
        # must terminate them after the camera and its lease writers disappear.
        checkpoint("workers_exited")
        if any(
            select.select([fds[name]], [], [], 0)[0]
            for name in ("game", "display", "pulse")
        ):
            raise ValueError("source actors died before explicit fixture cleanup")
        after = journal_read(control, control.directory)
        if before != after:
            raise ValueError("camera death changed or cleared unresolved journal")
        port = type("UnusedPort", (), {"dedicated_process": True})()
        with CadenceController(
            control.directory, control.policy, port, enabled=True
        ) as owner:
            control.check(owner.store)
            try:
                owner.execute(
                    Request(
                        "after-camera-death",
                        Generation("restart-owner", "restart-pipeline", "restart-peer"),
                        24,
                        1000000000,
                    )
                )
            except ValueError as error:
                if "dirty cadence journal" not in str(error):
                    raise
            else:
                raise ValueError("new controller bypassed unresolved intent")
        # These pidfds were pinned while each actor was a direct camera child.
        # Source processes are signalled only now, as explicit fixture cleanup.
        for name in ("game", "pulse", "display"):
            signal.pidfd_send_signal(fds[name], signal.SIGTERM)
            if not select.select([fds[name]], [], [], 1)[0]:
                signal.pidfd_send_signal(fds[name], signal.SIGKILL)
            wait_exit(fds[name], 1)
        ancestors = {os.getpid()}
        current = os.getpid()
        while current != 1:
            current = int(
                Path(f"/proc/{current}/stat").read_text().rsplit(")", 1)[1].split()[1]
            )
            ancestors.add(current)
        until = time.monotonic() + 2
        while True:
            residual = (
                set(map(int, Path("/sys/fs/cgroup/cgroup.procs").read_text().split()))
                - ancestors
            )
            absent = all(
                not Path(f"/proc/{body['processes'][name]['pid']}").exists()
                for name in ACTORS
            )
            if not residual and absent:
                break
            if time.monotonic() >= until:
                raise ValueError("fixture descendants not fully reaped")
            time.sleep(0.02)
        checkpoint("cleanup_finished")
        emit(
            "camera_death_verified",
            method=METHOD,
            journal=after,
            workers_exit_observed=True,
            worker_lifetimes_absent=True,
            source_alive_before_cleanup=True,
            source_cleanup=True,
            residual_descendants=0,
            restart_dispatch_blocked=True,
            controller_result=None,
            restoration="unavailable_camera_died",
            live_authority=False,
        )
        emit("complete", method=METHOD, live_authority=False, whole_camera_cleanup=True)
    finally:
        for fd in fds.values():
            os.close(fd)


if __name__ == "__main__":
    try:
        if len(sys.argv) != 4 or sys.argv[1] != "--monitor":
            raise ValueError("explicit owned-camera monitor required")
        monitor(int(sys.argv[2]), sys.argv[3])
    except Exception as error:
        emit(
            "failed",
            reason=type(error).__name__ + ": " + str(error),
            live_authority=False,
        )
        raise SystemExit(1)
