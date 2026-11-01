"""Independent exact-child lease guard. Parent EOF/hung polling tears down one worker."""

import os
import select
import signal
import subprocess
import sys
from pathlib import Path


class ParentLease:
    def __init__(self, pidfd, environment):
        self.write_fd = self.child = None
        read_fd, write_fd = os.pipe()
        ready_read, ready_write = os.pipe()
        try:
            self.child = subprocess.Popen(
                [
                    sys.executable,
                    str(Path(__file__).resolve()),
                    "--lease",
                    str(pidfd),
                    str(read_fd),
                    str(ready_write),
                ],
                pass_fds=(pidfd, read_fd, ready_write),
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                env=environment,
            )
            if (
                not select.select([ready_read], [], [], 2)[0]
                or os.read(ready_read, 1) != b"R"
                or self.child.poll() is not None
            ):
                raise ValueError("peer lifetime guard startup failed")
            self.write_fd = write_fd
            os.set_blocking(write_fd, False)
        except BaseException:
            os.close(write_fd)
            if self.child is not None:
                try:
                    self.child.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    self.child.terminate()
                    try:
                        self.child.wait(timeout=0.5)
                    except subprocess.TimeoutExpired:
                        self.child.kill()
                        self.child.wait(timeout=1)
            raise
        finally:
            os.close(read_fd)
            os.close(ready_read)
            os.close(ready_write)

    def heartbeat(self):
        if (
            self.write_fd is None
            or self.child.poll() is not None
            or os.write(self.write_fd, b"H") != 1
        ):
            raise ValueError("peer lifetime guard unavailable")

    def close(self):
        if self.write_fd is not None:
            os.close(self.write_fd)
            self.write_fd = None
        if self.child is not None:
            try:
                self.child.wait(timeout=2)
            except subprocess.TimeoutExpired:
                self.child.terminate()
                try:
                    self.child.wait(timeout=0.5)
                except subprocess.TimeoutExpired:
                    self.child.kill()
                    self.child.wait(timeout=1)
            finally:
                if self.child.returncode is not None:
                    self.child = None


def watch(pidfd, read_fd, ready_fd):
    os.write(ready_fd, b"R")
    os.close(ready_fd)
    while True:
        ready, _, _ = select.select([pidfd, read_fd], [], [], 3)
        if pidfd in ready:
            return
        if read_fd in ready:
            data = os.read(read_fd, 4096)
            if data and all(b == 72 for b in data):
                continue
        try:
            signal.pidfd_send_signal(pidfd, signal.SIGKILL)
        except ProcessLookupError:
            pass
        return


if __name__ == "__main__":
    if len(sys.argv) != 5 or sys.argv[1] != "--lease":
        raise SystemExit(2)
    watch(*(int(v) for v in sys.argv[2:]))
