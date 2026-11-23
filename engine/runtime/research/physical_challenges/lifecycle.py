"""Worker-local joint injection lifecycle, separate from fixed-condition modes.

The element must be the owned fixture identity element. Pressure uses the existing
durable two-child registry and EOF/40s failsafe. Callers must still integrate the
peer command protocol, camera/receiver health and complete source inspection.
"""

import re
import threading
import time
from contextlib import suppress
from copy import deepcopy
from types import MappingProxyType

METHOD = "n11-physical-condition-lifecycle-v1"
ERROR = "invalid_physical_challenge_lifecycle"
SECOND = 1_000_000_000
PHASES = ("degraded", "relief", "recovery")
RECIPES = MappingProxyType(
    {
        "mixed_delay_pressure": ((34000, 2), (34000, 2)),
        "delay_to_pressure": ((34000, 0), (0, 2)),
        "pressure_to_delay": ((0, 2), (34000, 0)),
        "control_no_injected_fault": ((0, 0), (0, 0)),
        "control_owned_identity_delay": ((34000, 0), (34000, 0)),
        "control_owned_cpu_pressure": ((0, 2), (0, 2)),
    }
)


def _pressure_factory():
    from scripts.research.n11.native.contained_pressure import ContainedPressure

    return ContainedPressure()


class ChallengeLifecycle:
    """Single-use injection/phase guard; synthetic checks are not native qualification.

    One monotonic worker clock brackets operations. The watchdog is armed before
    injection and never restarted. The caller dispatches cadence only immediately
    after dispatch_relief(), retaining the real controller's own deadlines.
    """

    def __init__(
        self,
        element,
        *,
        generation,
        current_generation,
        owns,
        pressure_factory=_pressure_factory,
        clock=time.monotonic_ns,
        timer_factory=threading.Timer,
    ):
        if (
            type(generation) is not dict
            or set(generation) != {"owner", "pipeline", "peer"}
            or any(
                type(v) is not str or re.fullmatch(r"[A-Za-z0-9_-]{1,64}", v) is None
                for v in generation.values()
            )
        ):
            raise ValueError(ERROR)
        self.element, self.generation = element, deepcopy(generation)
        self.current_generation, self.owns = current_generation, owns
        self.pressure_factory, self.clock, self.timer_factory = (
            pressure_factory,
            clock,
            timer_factory,
        )
        self.lock = threading.RLock()
        self.state, self.failed, self.expired = "fresh", False, False
        self.deadline_ns = self._last_now = self._ready_at = None
        self._pressure = self._timer = self._phase = self._phase_at = self._dispatch_at = None
        self._next_phase, self._expected_delay = 0, 0
        self._claimed_delay = self._transitioned = False
        self._events = []

    @property
    def events(self):
        return tuple(deepcopy(self._events))

    def _now(self):
        value = self.clock()
        if (
            type(value) is not int
            or value < 0
            or self._last_now is not None
            and value < self._last_now
        ):
            raise ValueError(ERROR)
        self._last_now = value
        return value

    def _owner(self):
        if self.owns() is not True or self.current_generation() != self.generation:
            raise ValueError(ERROR)

    def _checkpoint(self):
        now = self._now()
        self._owner()
        if self.failed or self.expired or self.state in ("closed", "cleanup_unconfirmed"):
            raise ValueError(ERROR)
        if self.deadline_ns is not None and now >= self.deadline_ns:
            self.expired = True
            raise ValueError(ERROR)
        if self._phase_at is not None and now - self._phase_at > 4_500_000_000:
            raise ValueError(ERROR)
        if self._phase == "relief" and now - self._dispatch_at >= 5 * SECOND:
            raise ValueError(ERROR)
        return now

    def _pressure_state(self):
        p = self._pressure
        if p is None:
            return dict(state="unused", active_workers=0, identities=[], cpu_ns=[])
        if not p.used:
            if p.children or p.handles or p.records or p.started_at is not None:
                raise ValueError(ERROR)
            return dict(
                state="closed_unused" if p.closed else "unused",
                active_workers=0,
                identities=[],
                cpu_ns=[],
            )
        if p.closed:
            if any(h is not None for h in p.handles) or any(c.poll() is None for c in p.children):
                raise ValueError(ERROR)
            return dict(state="reaped", active_workers=0, identities=p.identities(), cpu_ns=None)
        if len(p.children) != 2 or len(p.handles) != 2 or len(p.records) != 2:
            raise ValueError(ERROR)
        value = p.sample()  # Existing sampler pins identity, CPU counters and lifetime.
        if value["active_workers"] != 2 or len(value["identities"]) != 2:
            raise ValueError(ERROR)
        return dict(state="active", **value)

    def _witness(self):
        start = self._checkpoint()
        value = self.element.get_property("sleep-time")
        if type(value) is not int or value != self._expected_delay:
            raise ValueError(ERROR)
        pressure = self._pressure_state()
        post = self.element.get_property("sleep-time")
        if type(post) is not int or post != value:
            raise ValueError(ERROR)
        end = self._checkpoint()
        return dict(
            method=METHOD,
            generation=deepcopy(self.generation),
            read_start_ns=start,
            read_end_ns=end,
            delay_us=value,
            pressure=pressure,
            clock="worker_monotonic_ns",
            live_authority=False,
        )

    def _apply(self, target):
        before = self._witness()
        delay, workers = target
        if not workers and self._pressure.used and not self._pressure.closed:
            if self._pressure.close() is not True:
                raise ValueError(ERROR)
            if self._pressure_state()["active_workers"]:
                raise ValueError(ERROR)
        self._checkpoint()
        if delay != self._expected_delay:
            self._claimed_delay = True  # A setter can apply and then throw.
            self.element.set_property("sleep-time", delay)
            self._checkpoint()
            if self.element.get_property("sleep-time") != delay:
                raise ValueError(ERROR)
            self._expected_delay = delay
        if workers and not self._pressure.used:
            self._pressure.start()
        after = self._witness()
        if after["pressure"]["active_workers"] != workers:
            raise ValueError(ERROR)
        self._ready_at = after["read_end_ns"] + SECOND
        self._events.append(
            dict(
                kind="condition_applied",
                before=before,
                after=after,
                established_not_before_ns=self._ready_at,
            )
        )

    def _fail(self, error=None):
        self.failed = True
        with suppress(BaseException):  # Preserve primary error after both cleanup attempts.
            self.close()
        if error is not None and not isinstance(error, Exception):
            raise error
        raise ValueError(ERROR) from None

    def start(self, recipe):
        with self.lock:
            try:
                if self.state != "fresh" or type(recipe) is not str or recipe not in RECIPES:
                    raise ValueError(ERROR)
                self._owner()
                if self.element.get_property("sleep-time") != 0:
                    raise ValueError(ERROR)
                self._pressure = self.pressure_factory()
                if self._pressure_state()["state"] != "unused":
                    raise ValueError(ERROR)
                self._before, self._after = RECIPES[recipe]
                self.recipe = recipe
                now = self._now()
                self.deadline_ns = now + 20 * SECOND
                self.state = "active"
                self._timer = self.timer_factory(20, self.expire)
                self._timer.daemon = True
                self._timer.start()
                self._apply(self._before)
            except BaseException as error:
                self._fail(error)

    def witness(self):
        with self.lock:
            try:
                return self._witness()
            except BaseException as error:
                self._fail(error)

    def begin_phase(self, phase):
        with self.lock:
            try:
                now = self._checkpoint()
                if (
                    self.state != "active"
                    or self._phase is not None
                    or self._next_phase >= 3
                    or phase != PHASES[self._next_phase]
                    or now < self._ready_at
                ):
                    raise ValueError(ERROR)
                if phase == "relief" and (
                    not self._transitioned
                    or self._dispatch_at is None
                    or now - self._dispatch_at > 1_750_000_000
                ):
                    raise ValueError(ERROR)
                witness = self._witness()
                now = self._checkpoint()
                if phase == "relief" and now - self._dispatch_at > 1_750_000_000:
                    raise ValueError(ERROR)
                self._phase, self._phase_at = phase, now
                self._events.append(dict(kind="phase_start", phase=phase, witness=witness))
                return deepcopy(witness)
            except BaseException as error:
                self._fail(error)

    def finish_phase(self):
        with self.lock:
            try:
                self._checkpoint()
                if self._phase is None or self._now() <= self._phase_at:
                    raise ValueError(ERROR)
                witness = self._witness()
                self._events.append(dict(kind="phase_end", phase=self._phase, witness=witness))
                self._phase = self._phase_at = None
                self._next_phase += 1
                return deepcopy(witness)
            except BaseException as error:
                self._fail(error)

    def prepare_relief(self):
        with self.lock:
            try:
                self._checkpoint()
                if (
                    self._phase is not None
                    or self._next_phase != 1
                    or self._transitioned
                    or self._dispatch_at is not None
                ):
                    raise ValueError(ERROR)
                if self._before != self._after:
                    self._apply(self._after)
                else:
                    self._witness()
                self._transitioned = True
            except BaseException as error:
                self._fail(error)

    def dispatch_relief(self):
        with self.lock:
            try:
                now = self._checkpoint()
                if (
                    not self._transitioned
                    or self._next_phase != 1
                    or self._phase is not None
                    or self._dispatch_at is not None
                    or now < self._ready_at
                ):
                    raise ValueError(ERROR)
                self._witness()
                self._dispatch_at = self._checkpoint()
                self._events.append(dict(kind="cadence_dispatch_boundary", at_ns=self._dispatch_at))
                return self._dispatch_at
            except BaseException as error:
                self._fail(error)

    def close(self):
        """Always attempt both cleanup paths; failed cleanup can be attempted again."""
        with self.lock:
            if self.state == "closed":
                return True
            delay_ok = pressure_ok = False
            interrupt = None
            start = end = post = pressure = None
            try:
                start = self._now()
            except Exception:
                self.failed = True  # Clock failure never prevents resource cleanup.
            try:
                self._owner()
                value = self.element.get_property("sleep-time")
                if type(value) is int and (value == 0 or self._claimed_delay and value == 34000):
                    if value:
                        self._owner()
                        self.element.set_property("sleep-time", 0)
                    self._owner()
                    post = self.element.get_property("sleep-time")
                    self._owner()
                    delay_ok = type(post) is int and post == 0
            except BaseException as error:
                if not isinstance(error, Exception):
                    interrupt = error
            try:
                pressure_ok = self._pressure is None or self._pressure.close() is True
                if pressure_ok:
                    pressure = self._pressure_state()
                    pressure_ok = pressure["active_workers"] == 0
            except BaseException as error:
                pressure_ok = False
                if not isinstance(error, Exception):
                    interrupt = error
            try:
                end = self._now()
            except Exception:
                self.failed = True
            ok = delay_ok and pressure_ok
            self.state = "closed" if ok else "cleanup_unconfirmed"
            if ok and self._timer is not None:
                self._timer.cancel()
            if not ok:
                self.failed = True
            self._events.append(
                dict(
                    kind="cleanup",
                    delay_zero=delay_ok,
                    pressure_reaped=pressure_ok,
                    confirmed=ok,
                    read_start_ns=start,
                    read_end_ns=end,
                    post_delay_us=post,
                    post_pressure=pressure,
                    generation=deepcopy(self.generation),
                    failed=self.failed,
                    expired=self.expired,
                    live_authority=False,
                )
            )
            if interrupt is not None:
                raise interrupt
            return ok

    def expire(self):
        with self.lock:
            if self.state != "closed":
                self.expired = self.failed = True
                self.close()
