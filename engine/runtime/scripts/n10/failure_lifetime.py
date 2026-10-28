"""Read-only owned-fixture lifetime/journal observations; no private PID export."""

import copy
import os
import select
import stat
import subprocess
import time
from dataclasses import asdict
from pathlib import Path

from live_probe_control.contained_capture import GameCaptureContext, process_identity
from live_probe_control.contracts import digest
from live_probe_control.journal import CadenceJournal

METHOD = "n10-contained-game-lifetime-observations-v1"


def process_hash(boot, pid, start):
    return digest({"boot": boot, "pid": pid, "start": str(start)})


def process_read(boot, child=None):
    if child is not None and (
        type(child) is not subprocess.Popen or child.poll() is not None
    ):
        raise ValueError("exact live owned Popen required")
    pid = os.getpid() if child is None else child.pid
    before = process_identity(pid)
    fields = Path(f"/proc/{pid}/stat").read_text().rsplit(")", 1)[1].split()
    if (
        int(fields[19]) != before[1]
        or process_identity(pid) != before
        or (
            child is not None and (before[0] != os.getpid() or child.poll() is not None)
        )
    ):
        raise ValueError("owned process changed during read")
    return {
        "identity_hash": process_hash(boot, pid, before[1]),
        "cpu_ticks": int(fields[11]) + int(fields[12]),
    }


def journal_read(control, directory):
    # Atomic rename publishes a complete snapshot. This reader owns no writer
    # lease and has no write capability; an in-flight action keeps its lock.
    store = CadenceJournal(directory)
    try:
        store.directory_fd = os.open(
            directory, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
        )
        info = os.fstat(store.directory_fd)
        if info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != 0o700:
            raise ValueError("lifetime journal directory must be private and owned")
        control.check(store)
        store.journal = store._read()
        control.check(store)
        journal = copy.deepcopy(store.journal)
    finally:
        store.__exit__(None, None, None)
    if journal is None or len(journal["history"]) != 1:
        raise ValueError("one retained journal action required")
    # The underlying reader validates the private hash, format and budget first.
    private_hash = journal.pop("content_hash")
    boot = journal.pop("clock_boot")
    journal["boot_hash"] = digest({"boot": boot})
    journal["cooldown_until_ns_decimal"] = str(journal.pop("cooldown_until_ns"))
    for row in journal["history"]:
        row["process_hash"] = digest(row.pop("process"))
    return {
        "directory_hash": digest({"device": info.st_dev, "inode": info.st_ino}),
        "private_content_hash": private_hash,
        "projection_hash": digest(journal),
        "projection": journal,
    }


def observe(driver, phase, slots):
    if phase not in ("active_target", "replacement_ready", "issuer_restarted"):
        raise ValueError("closed lifetime observation phase required")
    started = time.monotonic_ns()
    boot = Path("/proc/sys/kernel/random/boot_id").read_text().strip()
    capture = GameCaptureContext.from_scene(driver.scene)
    if capture != driver.service.control.capture:
        raise ValueError("lifetime observation lost exact capture")
    processes = {
        "camera": process_read(boot),
        "game": process_read(boot, driver.scene.game),
        "display": process_read(boot, driver.scene.display),
    }
    peers = {}
    for peer, slot in slots.items():
        owner = slot.owner
        if (
            owner is None
            or owner.pidfd is None
            or select.select([owner.pidfd], [], [], 0)[0]
        ):
            raise ValueError("live owned peer pidfd required")
        body, received, sequence = owner.last_observation
        now = time.monotonic_ns()
        if not 0 <= now - received <= 1500000000:
            raise ValueError("lifetime native observation stale")
        peers[peer] = {
            "process": process_read(boot, owner.child),
            "generation": asdict(owner.generation),
            "token_hash": digest({"token": slot.token}),
            "offer_hash": digest({"sdp": slot.sdp}),
            "native_received_ns": received - driver.origin,
            "native_sequence": sequence,
            "native": copy.deepcopy(body),
        }
    old = None
    if phase != "active_target":
        code = driver.old_process.poll()
        if (
            type(code) is not int
            or driver.old.owner.child is not None
            or not driver.old.done.is_set()
        ):
            raise ValueError("retained exact old child not reaped/released")
        old = {
            "identity_hash": driver.old_process_hash,
            "returncode": code,
            "supervisor_exit_code": driver.old.owner.exit_code,
        }
    value = {
        "method": METHOD,
        "phase": phase,
        "case": driver.case,
        "basis": "camera_linux_monotonic_relative_brackets_child_stamps_unaligned",
        "read_start_ns": started - driver.origin,
        "processes": processes,
        "peers": peers,
        "capture_hash": digest(asdict(capture)),
        "issuer_epoch": driver.issuer_epoch,
        "journal": journal_read(driver.service.control, driver.local.directory),
        "old_process": old,
        "admission_outcomes": dict(driver.admission_outcomes),
        "live_authority": False,
    }
    value["read_end_ns"] = time.monotonic_ns() - driver.origin
    driver.emit("failure_lifetime", **value)
    return value
