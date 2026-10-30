"""Independent Linux pidfd watchdog for a dedicated owned pipeline worker only."""

import os
import select
import signal
import subprocess
import sys
from pathlib import Path

SECOND = 1000000000


def process_identity():
    # Private journal only; never exported as research evidence.
    boot = Path("/proc/sys/kernel/random/boot_id").read_text().strip()
    value = Path(f"/proc/{os.getpid()}/stat").read_text()
    return dict(boot=boot, pid=os.getpid(), start=value[value.rfind(")") + 2 :].split()[19])


def process_gone(identity):
    boot = Path("/proc/sys/kernel/random/boot_id").read_text().strip()
    if identity["boot"] != boot:
        return True
    try:
        value = Path(f"/proc/{identity['pid']}/stat").read_text()
    except FileNotFoundError:
        return True
    return value[value.rfind(")") + 2 :].split()[19] != identity["start"]


class PidfdWatchdog:
    """Deadline tears down the entire calling worker, never a PID read from disk.

    Only arm in a dedicated opt-in pipeline process. This cannot be bound to the
    existing multi-peer camera process without a separate lifecycle design.
    """

    def __init__(self):
        self.child = None
        self.write_fd = None

    def arm(self, duration_ns):
        from .contracts import integer

        integer(duration_ns, 1, 10 * SECOND)
        if (
            self.child is not None
            or sys.platform != "linux"
            or not hasattr(os, "pidfd_open")
            or not hasattr(signal, "pidfd_send_signal")
        ):
            raise ValueError("independent pidfd watchdog unavailable")
        pidfd = os.pidfd_open(os.getpid())
        read_fd, write_fd = os.pipe()
        ready_read, ready_write = os.pipe()
        try:
            self.child = subprocess.Popen(  # noqa: S603 -- trusted interpreter/helper and inherited exact pidfd
                [
                    sys.executable,
                    str(Path(__file__).resolve()),
                    "--worker",
                    str(pidfd),
                    str(read_fd),
                    str(duration_ns),
                    str(ready_write),
                ],
                pass_fds=(pidfd, read_fd, ready_write),
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            self.write_fd = write_fd
            ready, _, _ = select.select([ready_read], [], [], 2)
            if not ready or os.read(ready_read, 1) != b"R" or self.child.poll() is not None:
                raise ValueError("watchdog startup failed")
        except BaseException:
            os.close(write_fd)
            raise
        finally:
            os.close(pidfd)
            os.close(read_fd)
            os.close(ready_read)
            os.close(ready_write)

    def disarm(self):
        if self.child is None:
            return
        # Disarm only after verified restoration is durably clean. EOF is NOT a
        # cancel: losing the controller triggers exact-worker teardown.
        os.write(self.write_fd, b"C")
        os.close(self.write_fd)
        self.write_fd = None
        if self.child.wait(timeout=2) != 0:
            raise ValueError("watchdog did not acknowledge cancellation")
        self.child = None


def worker(pidfd, read_fd, duration_ns, ready_fd):
    os.write(ready_fd, b"R")
    os.close(ready_fd)
    ready, _, _ = select.select([read_fd], [], [], duration_ns / SECOND)
    if ready and os.read(read_fd, 2) == b"C":
        return
    try:
        signal.pidfd_send_signal(pidfd, signal.SIGKILL)
    except ProcessLookupError:
        return


if __name__ == "__main__":
    # Absolute-path child execution must not import the parent package/camera.
    if len(sys.argv) != 6 or sys.argv[1] != "--worker":
        raise SystemExit(2)
    worker(int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5]))
