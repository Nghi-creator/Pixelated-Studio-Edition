"""Prepare/submit/cancel an opt-in in-container campaign; never starts playback."""

import argparse
import os
import sys
import uuid
from pathlib import Path

from .campaign import read_private
from .campaign_plan import SCENARIOS, decode
from .manifest_export import json_bytes
from .output import write_atomic


def prepare(args):
    trials = []
    for assignment in ("engineering",) if args.overhead else ("reference", "held_out_query"):
        for scenario in ("healthy",) if args.overhead else SCENARIOS:
            for repeat in range(1, 11 if args.overhead else args.repeats + 1):
                trials.append(
                    dict(
                        run_id=f"run-{len(trials) + 1}",
                        source_id=uuid.uuid4().hex,
                        scenario=scenario,
                        assignment=assignment,
                        repeat_index=repeat,
                    )
                )
    plan = dict(
        schema_version="n5-campaign-plan-v1",
        campaign_id=args.campaign_id,
        core_version=args.core_version,
        producer_version=args.producer_version,
        node_id="node-1",
        workload_id=args.workload_id,
        node_version=args.node_version,
        host_workers=args.workers,
        seed=args.seed,
        trials=trials,
    )
    payload = json_bytes(plan)
    decode(payload)
    if args.output.exists():
        raise ValueError("plan already exists")
    write_atomic(args.output, payload)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    plan = commands.add_parser("prepare")
    plan.add_argument("--output", required=True, type=Path)
    plan.add_argument("--campaign-id", default="campaign-1")
    plan.add_argument("--core-version", required=True)
    plan.add_argument("--producer-version", required=True)
    plan.add_argument("--node-version", required=True)
    plan.add_argument("--workload-id", default="workload-1")
    plan.add_argument("--workers", type=int, choices=range(1, 9), default=1)
    plan.add_argument("--overhead", action="store_true")
    plan.add_argument("--seed", type=int, default=7)
    plan.add_argument("--repeats", type=int, choices=range(1, 5), default=3)
    for name in ("submit", "submit-overhead", "cancel", "clear-request"):
        command = commands.add_parser(name)
        command.add_argument("--directory", type=Path, required=True)
        if name in ("submit", "submit-overhead"):
            command.add_argument("--plan", type=Path, required=True)
    args = parser.parse_args(argv)
    try:
        if args.command == "prepare":
            prepare(args)
        elif args.command == "clear-request":
            from .lease import RuntimeLease

            with RuntimeLease(args.directory) as lease:
                if lease.journal is not None and lease.journal["state"] != "clean":
                    raise ValueError("dirty ownership cannot be cleared")
                for name in (
                    "request.json",
                    "overhead-request.json",
                    "cancel.json",
                    "service-error.json",
                ):
                    try:
                        read_private(args.directory, name)
                    except FileNotFoundError:
                        continue
                    os.unlink(name, dir_fd=lease.directory_fd)
        elif args.command == "cancel":
            # Root checks are shared with service, with no raw peer/token in the command.
            try:
                read_private(args.directory, "request.json")
            except FileNotFoundError:
                read_private(args.directory, "overhead-request.json")
            write_atomic(args.directory / "cancel.json", b'{"cancel":true}\n')
        else:
            from .lease import RuntimeLease

            with RuntimeLease(args.directory) as lease:
                if lease.journal is not None and lease.journal["state"] != "clean":
                    raise ValueError("dirty ownership requires recovery")
                for name in ("request.json", "overhead-request.json"):
                    try:
                        read_private(args.directory, name)
                    except FileNotFoundError:
                        continue
                    raise ValueError("request already exists")
                fd = os.open(args.plan, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
                try:
                    import stat

                    if not stat.S_ISREG(os.fstat(fd).st_mode):
                        raise ValueError("regular campaign plan required")
                    with os.fdopen(fd, "rb", closefd=False) as source:
                        data = source.read(65537)
                finally:
                    os.close(fd)
                value = decode(data)
                if args.command == "submit-overhead" and (
                    len(value["trials"]) != 10
                    or any(
                        t["scenario"] != "healthy" or t["assignment"] != "engineering"
                        for t in value["trials"]
                    )
                ):
                    raise ValueError("explicit ten-trial overhead schedule required")
                write_atomic(
                    args.directory
                    / (
                        "overhead-request.json"
                        if args.command == "submit-overhead"
                        else "request.json"
                    ),
                    data,
                )
    except (OSError, ValueError, TypeError, KeyError):
        print("error: N5 campaign command failed", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
