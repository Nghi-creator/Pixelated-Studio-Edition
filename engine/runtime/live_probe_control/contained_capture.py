"""Read-only lifetime pins for an explicitly owned disposable X99 game scene."""

import os
import select
import stat
import subprocess
import sys
import time
from dataclasses import asdict, dataclass
from pathlib import Path

from .contracts import integer

SOCKET = Path("/tmp/.X11-unix/X99")


def process_identity(pid):
    info = Path(f"/proc/{pid}").stat()
    if info.st_uid != os.getuid():
        raise ValueError("capture process has a foreign owner")
    fields = Path(f"/proc/{pid}/stat").read_text().rsplit(")", 1)[1].split()
    if fields[0] in ("Z", "X"):
        raise ValueError("capture process exited")
    return int(fields[1]), int(fields[19])


def socket_identity():
    info = SOCKET.lstat()
    if not stat.S_ISSOCK(info.st_mode) or info.st_uid != os.getuid():
        raise ValueError("owned X99 socket unavailable")
    return info.st_dev, info.st_ino


@dataclass(frozen=True)
class GameCaptureContext:
    owner_pid: int
    owner_start: int
    game_pid: int
    game_start: int
    display_pid: int
    display_start: int
    socket_device: int
    socket_inode: int

    def __post_init__(self):
        for key, value in asdict(self).items():
            integer(value, 0 if key == "socket_device" else 1, 2**63 - 1)
        if len({self.owner_pid, self.game_pid, self.display_pid}) != 3:
            raise ValueError("distinct owned capture lifetimes required")

    @classmethod
    def from_wire(cls, body):
        if type(body) is not dict or set(body) != set(cls.__dataclass_fields__):
            raise ValueError("closed game capture context required")
        return cls(**body)

    @classmethod
    def from_scene(cls, scene):
        from .game_scene import GameScene

        if type(scene) is not GameScene or scene.number != 99:
            raise ValueError("exact owned disposable X99 scene required")
        if any(type(child) is not subprocess.Popen or child.poll() is not None for child in (scene.game, scene.display)):
            raise ValueError("live Popen-owned game/display required")
        owner = os.getpid()
        _, owner_start = process_identity(owner)
        game_parent, game_start = process_identity(scene.game.pid)
        display_parent, display_start = process_identity(scene.display.pid)
        if game_parent != owner or display_parent != owner:
            raise ValueError("capture children have a foreign parent")
        device, inode = socket_identity()
        value = cls(owner, owner_start, scene.game.pid, game_start, scene.display.pid, display_start, device, inode)
        with PinnedGameCapture(value, expected_owner=owner):
            return value


class PinnedGameCapture:
    """No signal/kill operation: these descriptors only establish source liveness."""

    def __init__(self, context, *, expected_owner, clock=time.monotonic_ns):
        if type(context) is not GameCaptureContext or context.owner_pid != expected_owner:
            raise ValueError("capture owner does not match the private host")
        if sys.platform != "linux" or not hasattr(os, "pidfd_open"):
            raise ValueError("capture lifetime pins require Linux pidfds")
        self.context, self.clock = context, clock
        self.fds, self.valid, self.next_check = [], True, 0
        self.last_seen = None
        self.poller = select.poll()
        try:
            for pid, start, parent in ((context.owner_pid, context.owner_start, None),
                                       (context.game_pid, context.game_start, context.owner_pid),
                                       (context.display_pid, context.display_start, context.owner_pid)):
                before = process_identity(pid)
                if before[1] != start or (parent is not None and before[0] != parent):
                    raise ValueError("capture process lifetime/parent changed")
                fd = os.pidfd_open(pid)
                self.fds.append(fd)
                self.poller.register(fd, select.POLLIN | select.POLLHUP | select.POLLERR)
                if process_identity(pid) != before:
                    raise ValueError("capture lifetime changed while pinning")
            if not self.healthy(force=True):
                raise ValueError("capture source identity unavailable")
        except BaseException:
            self.close()
            raise

    def healthy(self, *, force=False):
        if not self.valid or not self.fds:
            return False
        if self.poller.poll(0):
            self.valid = False
            return False
        now = self.clock()
        if type(now) is not int or now < 0 or (self.last_seen is not None and now < self.last_seen):
            self.valid = False
            return False
        self.last_seen = now
        if force or now >= self.next_check:
            # Four periodic filesystem checks/s; bootstrap and setters force a read.
            self.next_check = now + 250000000
            try:
                self.valid = socket_identity() == (self.context.socket_device, self.context.socket_inode)
            except (OSError, ValueError):
                self.valid = False
        return self.valid

    def close(self):
        self.valid = False
        for fd in self.fds:
            os.close(fd)
        self.fds.clear()

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()
