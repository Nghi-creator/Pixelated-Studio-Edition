"""Fixed, owned Frozen-Bubble level and private display. No host display attachment."""

import ctypes
import os
import select
import subprocess
import time

from .contracts import SECOND


FIXTURE_SEED = 1
FIXTURE_RANDOMNESS = f"""BEGIN {{
    *CORE::GLOBAL::srand = sub {{ CORE::srand({FIXTURE_SEED}) }};
    CORE::srand({FIXTURE_SEED});
}}
"""


def game_command(*, fixed_seed=False):
    if type(fixed_seed) is not bool:
        raise ValueError("explicit fixture randomness choice required")
    arguments = ["--fullscreen", "--solo", "--level", "1", "--no-sound", "--no-music", "--private"]
    if not fixed_seed:
        return ["/usr/games/frozen-bubble", *arguments]
    # Frozen-Bubble explicitly reseeds from SDL ticks after loading a level.
    # Install the fixture override before compiling that script, retaining its
    # original arguments and one directly Popen-owned interpreter lifetime.
    program = FIXTURE_RANDOMNESS + '\n$0 = "/usr/games/frozen-bubble"; my $loaded = do $0; die $@ if $@; die $! unless defined $loaded;'
    return ["/usr/bin/perl", "-e", program, "--", *arguments]


class GameScene:
    def __init__(self, *, defer_script=False, fixed_seed=False):
        game_command(fixed_seed=fixed_seed)  # Validate before allocating processes.
        self.fixed_seed = fixed_seed
        self.display = self.game = self.connection = None
        self.number = None
        self.started = None
        self.sent = 0
        self.held = None
        self.release_at = 0
        self.game_start_ticks = None
        self.defer_script = defer_script
        self.script_started = None

    def start(self):
        self.x11 = ctypes.CDLL("libX11.so.6")
        if not self.x11.XInitThreads():
            raise ValueError("Xlib threading unavailable")
        read_fd, write_fd = os.pipe()
        try:
            self.display = subprocess.Popen(
                [
                    "/usr/bin/Xvfb",
                    "-displayfd",
                    str(write_fd),
                    "-screen",
                    "0",
                    "640x480x24",
                    "-nolisten",
                    "tcp",
                ],
                pass_fds=(write_fd,),
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            os.close(write_fd)
            write_fd = None
            if not select.select([read_fd], [], [], 3)[0]:
                raise ValueError("private display startup failed")
            data = os.read(read_fd, 16)
            if not data.endswith(b"\n") or not data[:-1].isdigit():
                raise ValueError("private display identity unavailable")
            self.number = int(data[:-1])
            if not 0 <= self.number <= 65535 or self.display.poll() is not None:
                raise ValueError("private display unavailable")
        finally:
            os.close(read_fd)
            if write_fd is not None:
                os.close(write_fd)
        environment = dict(
            os.environ, DISPLAY=f":{self.number}", SDL_AUDIODRIVER="dummy"
        )
        self.game = subprocess.Popen(
            game_command(fixed_seed=self.fixed_seed),
            env=environment,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        self.x11.XOpenDisplay.argtypes = [ctypes.c_char_p]
        self.x11.XOpenDisplay.restype = ctypes.c_void_p
        self.x11.XCloseDisplay.argtypes = [ctypes.c_void_p]
        self.x11.XFlush.argtypes = [ctypes.c_void_p]
        self.x11.XStringToKeysym.argtypes = [ctypes.c_char_p]
        self.x11.XStringToKeysym.restype = ctypes.c_ulong
        self.x11.XKeysymToKeycode.argtypes = [ctypes.c_void_p, ctypes.c_ulong]
        self.x11.XKeysymToKeycode.restype = ctypes.c_uint
        self.xtst = ctypes.CDLL("libXtst.so.6")
        self.xtst.XTestFakeKeyEvent.argtypes = [
            ctypes.c_void_p,
            ctypes.c_uint,
            ctypes.c_int,
            ctypes.c_ulong,
        ]
        self.connection = self.x11.XOpenDisplay(f":{self.number}".encode())
        if not self.connection:
            raise ValueError("owned display control unavailable")
        self.started = time.monotonic_ns()
        if not self.defer_script:
            self.script_started = self.started + 3 * SECOND
        self.resources()

    def arm_script(self):
        """One-shot local diagnostic boundary; never resets a running script."""
        if not self.defer_script or self.script_started is not None or self.sent:
            raise ValueError("game script already armed")
        if self.started is None or time.monotonic_ns() - self.started < 3 * SECOND:
            raise ValueError("game load interval incomplete")
        self.script_started = time.monotonic_ns()

    def phase(self):
        now = time.monotonic_ns()
        return {"game_age_ns": now - self.started,
                "script_age_ns": None if self.script_started is None else now - self.script_started,
                "script_actions": self.sent}

    def _key(self, name, down):
        code = self.x11.XKeysymToKeycode(
            self.connection, self.x11.XStringToKeysym(name)
        )
        if not code or not self.xtst.XTestFakeKeyEvent(self.connection, code, down, 0):
            raise ValueError("owned game input failed")
        self.x11.XFlush(self.connection)

    def tick(self):
        if self.game.poll() is not None or self.display.poll() is not None:
            raise ValueError("owned game/display exited")
        now = time.monotonic_ns()
        if self.held is not None and now >= self.release_at:
            self._key(self.held, 0)
            self.held = None
        # Fixed script only. Diagnostics may defer its one-shot start boundary.
        if self.script_started is None:
            return
        index = (now - self.script_started) // 400000000
        if index >= self.sent and index >= 0:
            if self.sent >= 64:
                raise ValueError("game input budget exceeded")
            if self.held is not None:
                self._key(self.held, 0)
            self.held = (b"Up", b"Left", b"Up", b"Right")[self.sent % 4]
            self._key(self.held, 1)
            self.release_at = now + 60000000
            self.sent += 1

    def resources(self):
        # Exact Popen-owned lifetime; no process selected from a persisted record.
        with open(f"/proc/{self.game.pid}/stat") as source:
            fields = source.read(8192).rsplit(")", 1)[1].split()
        ticks = fields[19]
        if self.game_start_ticks is None:
            self.game_start_ticks = ticks
        if ticks != self.game_start_ticks:
            raise ValueError("game lifetime changed")
        return {
            "cpu_ticks": int(fields[11]) + int(fields[12]),
            "rss_bytes": int(fields[21]) * os.sysconf("SC_PAGE_SIZE"),
        }

    def close(self):
        ok = True
        if self.connection is not None:
            try:
                if self.held is not None:
                    self._key(self.held, 0)
                self.x11.XCloseDisplay(self.connection)
            except (OSError, ValueError, ctypes.ArgumentError):
                ok = False
            finally:
                self.connection = None
        for child in (self.game, self.display):
            if child is None:
                continue
            try:
                child.terminate()
                try:
                    child.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    child.kill()
                    child.wait(timeout=2)
            except (OSError, subprocess.TimeoutExpired):
                ok = False
        return ok
