"""Cost checkpoints around unchanged owned-game fault semantics; no network control."""

import json
import os
import stat
import time
from pathlib import Path
from game_failure_acceptance import GameFailureAcceptance, MODES
from live_probe_control.browser_game_worker import strict_object

METHOD = "n10-contained-game-fault-cost-v1"
COST_MODES = {mode + "-cost": mode for mode in MODES}


class FaultCostAcceptance(GameFailureAcceptance):
    def __init__(self, *args, container_cost, **kwargs):
        original_emit = args[5]
        self.cost, self.gated = container_cost, False
        self.cost_index = 0

        def observed(kind, **values):
            original_emit(kind, **values)
            phase = {
                "game_failure_fault": "fault_injected",
                "game_failure_result": "result_observed",
                "game_failure_verified": "lifecycle_verified",
            }.get(kind)
            if phase:
                self.checkpoint(phase)

        args = (*args[:5], observed, *args[6:])
        super().__init__(*args, **kwargs)
        self.cost_emit = original_emit

    def checkpoint(self, phase):
        self.cost_emit(
            "fault_cost_checkpoint",
            method=METHOD,
            case=self.case,
            phase=phase,
            index=self.cost_index,
            sample=self.cost.sample(),
            live_authority=False,
        )
        self.cost_index += 1

    def before_dispatch(self):
        self.checkpoint("before_dispatch")

    def tick(self):
        if not self.gated:
            if time.monotonic_ns() - self.origin > 8000000000:
                raise ValueError("fault cost browser start deadline")
            marker = Path("/acceptance/fault-cost-ready.json")
            try:
                fd = os.open(marker, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
            except FileNotFoundError:
                return False
            with os.fdopen(fd, "rb") as source:
                if not stat.S_ISREG(os.fstat(source.fileno()).st_mode):
                    raise ValueError("fault cost marker must be regular")
                body = source.read(4097)
            if len(body) > 4096:
                raise ValueError("fault cost marker bound")
            if json.loads(body, object_pairs_hook=strict_object) != {
                "method": METHOD,
                "case": self.case,
                "peers": ["first", "second"],
            }:
                raise ValueError("fault cost browser marker mismatch")
            self.gated = True
            self.cost_emit(
                "fault_cost_started",
                method=METHOD,
                case=self.case,
                live_authority=False,
            )
        return super().tick()
