"""Trusted native child. Park before durable ownership, bounded pressure after GO.

No user command, network, filesystem or media callback work. stdin EOF stops even
after parent death; an independent monotonic watchdog also bounds active work.
"""

import os
import select
import sys
import time


def main():
    if len(sys.argv) != 2 or not sys.argv[1].isdigit():
        return 2
    duration = int(sys.argv[1])
    if not 40_000_000_000 <= duration <= 300_000_000_000:
        return 2
    os.write(1, b"READY\n")
    readable, _, _ = select.select([0], [], [], 5)
    if not readable or os.read(0, 4) != b"GO\n":
        return 0
    end = time.monotonic_ns() + duration
    os.write(1, b"ACTIVE\n")
    value = 1
    while time.monotonic_ns() < end:
        if select.select([0], [], [], 0)[0]:
            return 0  # STOP or parent EOF: both release the owned child.
        # Bound responsiveness without an unbounded compute chunk.
        for _ in range(2000):
            value = (value * 1664525 + 1013904223) & 0xFFFFFFFF
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
