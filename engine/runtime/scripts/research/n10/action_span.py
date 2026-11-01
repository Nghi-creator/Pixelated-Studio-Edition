"""Checkpointed owned-process cost span; failed prefixes never become complete costs."""

import os
import time

from action_cost import GameActionCost
from observer_native_screen import NativeScreen

SPAN_METHOD = "n10-owned-game-cost-span-v1"
EXCLUDED = (
    "lease_guard",
    "watchdog_child",
    "startup_and_warmup",
    "teardown",
    "browser_rss_and_gpu",
)


class NativeCostSpan:
    def __init__(self, service, scene, pulse, emit, origin):
        self.service, self.scene, self.pulse, self.emit, self.origin = (
            service,
            scene,
            pulse,
            emit,
            origin,
        )
        self.reader = NativeScreen(service, scene)
        self.workers = {p: service.active[p].owner.child for p in ("first", "second")}
        self.count, self.next_at, self.closed = 0, 0, False
        emit(
            "cost_span_started",
            method=SPAN_METHOD,
            excluded_cost_scopes=list(EXCLUDED),
            live_authority=False,
        )
        self.sample(force=True)

    def sample(self, *, force=False):
        now = time.monotonic_ns()
        if self.closed or (not force and now < self.next_at):
            return
        if self.count >= 96:
            raise ValueError("cost span sample bound")
        start, actors, missing = time.monotonic_ns(), {}, {}
        readers = {
            "parent": lambda: self.reader.process("parent"),
            "relay": lambda: self.reader.process("relay", parent=True),
            "game": self.scene.resources,
            "pulse": lambda: self.reader.process("pulse", self.pulse),
        }
        for peer, child in self.workers.items():
            readers[peer] = lambda peer=peer, child=child: self.worker(peer, child)
        for name, read in readers.items():
            try:
                actors[name] = read()
            except (ValueError, OSError, ProcessLookupError):
                actors[name], missing[name] = None, "owned_process_unavailable"
        self.emit(
            "cost_span_sample",
            method=SPAN_METHOD,
            sequence=self.count,
            read_start_ns=start,
            read_end_ns=time.monotonic_ns(),
            at_ns=time.monotonic_ns() - self.origin,
            game_phase=self.scene.phase(),
            actors=actors,
            missing=missing,
            live_authority=False,
        )
        self.count += 1
        self.next_at = now + 250000000

    def worker(self, peer, child):
        slot = self.service.active.get(peer)
        if slot is None or slot.owner is None or slot.owner.child is not child:
            raise ValueError("cost worker lifetime changed")
        return self.reader.process(peer, child)

    def finish(self, outcome):
        if self.closed:
            return
        # Already checkpointed samples survive even if this final read fails.
        try:
            self.sample(force=True)
        finally:
            self.closed = True
            self.emit(
                "cost_span_finished",
                method=SPAN_METHOD,
                outcome=outcome,
                sample_count=self.count,
                ticks_per_second=os.sysconf("SC_CLK_TCK"),
                excluded_cost_scopes=list(EXCLUDED),
                live_authority=False,
            )


class GameActionSpan(GameActionCost):
    def __init__(self, *args, pulse, container_cost, inject_failure=False, **kwargs):
        super().__init__(*args, version="v3", **kwargs)
        self.pulse, self.inject_failure, self.span = pulse, inject_failure, None
        self.container_cost = container_cost

    def begin_window(self, phase, age):
        if phase == "baseline":
            self.container_cost.start_action()
            self.span = NativeCostSpan(
                self.service, self.scene, self.pulse, self.emit, self.origin
            )
        super().begin_window(phase, age)

    def tick(self):
        try:
            done = super().tick()
            if self.span:
                self.span.sample()
                if (
                    self.inject_failure
                    and self.scene.phase()["script_age_ns"] >= 9500000000
                ):
                    raise ValueError("predeclared cost-span failure at script9.5s")
                if done:
                    self.span.finish("completed")
                    self.container_cost.finish_action("completed")
            return done
        except Exception:
            if self.span:
                self.span.finish("failed_prefix")
                self.container_cost.finish_action("failed_prefix")
            raise
