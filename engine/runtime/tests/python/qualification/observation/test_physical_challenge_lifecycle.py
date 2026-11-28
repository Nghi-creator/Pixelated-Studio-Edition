"""Synthetic worker-local lifecycle checks; no physical qualification or collection."""

import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

from research.physical_challenges.lifecycle import ChallengeLifecycle


class Clock:
    def __init__(self):
        self.ns = 0

    def __call__(self):
        return self.ns

    def advance(self, seconds):
        self.ns += int(seconds * 1_000_000_000)


class Timer:
    def __init__(self, seconds, callback):
        self.seconds, self.callback, self.cancelled = seconds, callback, False

    def start(self):
        pass

    def cancel(self):
        self.cancelled = True


class Pressure:
    def __init__(self):
        self.used = self.closed = False
        self.children, self.handles, self.records = [], [], []
        self.started_at = None
        self.directory = tempfile.TemporaryDirectory()
        self.close_calls = 0
        self.fail_start = self.fail_close = self.lost = False

    def start(self):
        self.used = True
        self.children = [SimpleNamespace(poll=lambda: 0 if self.closed else None) for _ in range(2)]
        self.handles = [object(), object()]
        self.records = [
            dict(pid=i, boot="00000000-0000-0000-0000-000000000001", start=i + 10)
            for i in (101, 102)
        ]
        self.started_at = 0
        if self.fail_start:
            raise ValueError("partial pressure start")
        raw = json.dumps(
            dict(version="n11-private-pressure-v1", state="active", workers=self.records),
            sort_keys=True,
        ).encode()
        Path(self.directory.name, "intent.json").write_bytes(raw)
        return dict(
            workers=2,
            maximum_active_ns=20000000000,
            child_failsafe_ns=40000000000,
            identities=self.identities(),
            intent_sha256=hashlib.sha256(raw).hexdigest(),
            allocation_cores=2,
        )

    def sample(self):
        if self.lost or self.closed:
            raise ValueError("pressure lost")
        return dict(
            identities=self.identities(),
            active_workers=2,
            cpu_ns=[10, 20],
            cgroup=dict(nr_periods=10, nr_throttled=1, throttled_usec=100),
        )

    def identities(self):
        return [
            hashlib.sha256(json.dumps(r, sort_keys=True).encode()).hexdigest() for r in self.records
        ]

    def close(self):
        self.close_calls += 1
        if self.fail_close:
            return False
        self.closed = True
        self.directory.cleanup()
        self.handles = [None for _ in self.handles]
        return True


class LifecycleTests(unittest.TestCase):
    def make(self):
        self.clock, self.pressure = Clock(), Pressure()
        self.addCleanup(self.pressure.directory.cleanup)
        self.value, self.owned = 0, True
        self.generation = dict(owner="owner", pipeline="pipeline", peer="peer")
        self.timers, self.writes = [], []
        self.setter_error = False

        def setter(name, value):
            self.value = value
            self.writes.append(value)
            if self.setter_error and value:
                raise ValueError("setter failed after applying")

        def timer(seconds, callback):
            value = Timer(seconds, callback)
            self.timers.append(value)
            return value

        element = SimpleNamespace(get_property=lambda _: self.value, set_property=setter)
        return ChallengeLifecycle(
            element,
            generation=self.generation.copy(),
            current_generation=lambda: self.generation.copy(),
            owns=lambda: self.owned,
            pressure_factory=lambda: self.pressure,
            clock=self.clock,
            timer_factory=timer,
        )

    def phase(self, controller, name):
        controller.begin_phase(name)
        self.clock.advance(3.2)
        controller.finish_phase()

    def test_all_challenges_and_matched_controls_complete_and_restore(self):
        for name in (
            "mixed_delay_pressure",
            "delay_to_pressure",
            "pressure_to_delay",
            "control_no_injected_fault",
            "control_owned_identity_delay",
            "control_owned_cpu_pressure",
        ):
            with self.subTest(name=name):
                c = self.make()
                c.start(name)
                self.clock.advance(1)
                self.phase(c, "degraded")
                c.prepare_relief()
                self.clock.advance(1)
                c.dispatch_relief()
                self.phase(c, "relief")
                self.phase(c, "recovery")
                self.assertTrue(c.close())
                self.assertEqual(self.value, 0)
                self.assertTrue(self.pressure.closed)
                self.assertEqual(len(self.timers), 1)
                self.assertEqual(c.state, "closed")
                self.assertFalse(c.failed)
                self.assertTrue(c.events)

    def test_pressure_start_retains_original_durable_intent_and_brackets(self):
        c = self.make()
        c.start("mixed_delay_pressure")
        receipt = c.events[0]["pressure_start"]
        self.assertEqual(receipt["method"], "n11-physical-pressure-start-v1")
        self.assertEqual(receipt["read_start_ns"], 0)
        self.assertEqual(receipt["read_end_ns"], 0)
        self.assertEqual(receipt["start_result"]["identities"], self.pressure.identities())
        self.assertEqual(
            hashlib.sha256(receipt["intent_json"].encode()).hexdigest(),
            receipt["start_result"]["intent_sha256"],
        )
        c.close()
        self.assertEqual(
            json.loads(c.events[0]["pressure_start"]["intent_json"])["state"], "active"
        )

    def test_missing_or_tampered_start_receipt_fails_closed(self):
        for change in ("missing", "digest", "identity", "symlink"):
            with self.subTest(change=change):
                c = self.make()
                original = self.pressure.start

                def altered(original=original, change=change):
                    result = original()
                    path = Path(self.pressure.directory.name, "intent.json")
                    if change == "missing":
                        return None
                    if change == "digest":
                        result["intent_sha256"] = "0" * 64
                    if change == "identity":
                        result["identities"] = ["a" * 64, "b" * 64]
                    if change == "symlink":
                        path.rename(path.with_name("other.json"))
                        path.symlink_to("other.json")
                    return result

                self.pressure.start = altered
                with self.assertRaises(ValueError):
                    c.start("mixed_delay_pressure")
                self.assertTrue(c.failed)
                self.assertTrue(self.pressure.closed)
                self.assertEqual(self.value, 0)

    def test_transition_never_restarts_condition_watchdog(self):
        c = self.make()
        c.start("delay_to_pressure")
        deadline = c.deadline_ns
        self.clock.advance(1)
        self.phase(c, "degraded")
        c.prepare_relief()
        self.assertEqual(c.deadline_ns, deadline)
        self.assertEqual(len(self.timers), 1)
        self.assertEqual(self.value, 0)
        self.assertTrue(self.pressure.used)

    def test_early_relief_dispatch_and_out_of_order_phase_fail_closed(self):
        for operation in (lambda c: c.dispatch_relief(), lambda c: c.begin_phase("relief")):
            c = self.make()
            c.start("mixed_delay_pressure")
            with self.assertRaises(ValueError):
                operation(c)
            self.assertTrue(c.failed)
            self.assertEqual(self.value, 0)
            self.assertTrue(self.pressure.closed)

    def test_transition_establishment_is_required_before_dispatch(self):
        c = self.make()
        c.start("delay_to_pressure")
        self.clock.advance(1)
        self.phase(c, "degraded")
        c.prepare_relief()
        with self.assertRaises(ValueError):
            c.dispatch_relief()
        self.assertTrue(c.failed)

    def test_setter_partial_failure_still_restores_and_reaps(self):
        c = self.make()
        self.setter_error = True
        with self.assertRaises(ValueError):
            c.start("mixed_delay_pressure")
        self.assertEqual(self.value, 0)
        self.assertTrue(self.pressure.closed)

    def test_partial_pressure_start_still_restores_and_reaps(self):
        c = self.make()
        self.pressure.fail_start = True
        with self.assertRaises(ValueError):
            c.start("mixed_delay_pressure")
        self.assertEqual(self.value, 0)
        self.assertTrue(self.pressure.closed)

    def test_generation_loss_does_not_write_foreign_property_but_reaps_own_children(self):
        c = self.make()
        c.start("mixed_delay_pressure")
        self.generation["pipeline"] = "replacement"
        self.writes.clear()
        with self.assertRaises(ValueError):
            c.witness()
        self.assertEqual(self.writes, [])
        self.assertTrue(self.pressure.closed)
        self.assertEqual(c.state, "cleanup_unconfirmed")

    def test_cleanup_failure_is_not_a_success_or_cancelled_watchdog(self):
        c = self.make()
        c.start("mixed_delay_pressure")
        self.pressure.fail_close = True
        self.assertFalse(c.close())
        self.assertFalse(self.timers[0].cancelled)
        self.pressure.fail_close = False
        self.assertTrue(c.close())
        self.assertTrue(c.failed)
        self.assertEqual(len(self.timers), 1)

    def test_watchdog_restores_and_prevents_measurement(self):
        c = self.make()
        c.start("mixed_delay_pressure")
        self.clock.advance(20)
        self.timers[0].callback()
        self.assertEqual(self.value, 0)
        self.assertTrue(self.pressure.closed)
        self.assertTrue(c.expired)
        with self.assertRaises(ValueError):
            c.begin_phase("degraded")

    def test_foreign_preimage_and_arbitrary_recipe_are_never_cleared(self):
        for name in ("mixed_delay_pressure", "owned_cpu_pressure", "unknown"):
            c = self.make()
            self.value = 25000
            with self.assertRaises(ValueError):
                c.start(name)
            self.assertEqual(self.writes, [])
            self.assertEqual(self.value, 25000)

    def test_phase_deadline_reaps_even_when_delay_already_removed(self):
        c = self.make()
        c.start("delay_to_pressure")
        self.clock.advance(1)
        c.begin_phase("degraded")
        self.clock.advance(4.6)
        with self.assertRaises(ValueError):
            c.finish_phase()
        self.assertEqual(self.value, 0)

    def test_closed_controller_cannot_be_restarted(self):
        c = self.make()
        c.start("control_no_injected_fault")
        self.assertTrue(c.close())
        with self.assertRaises(ValueError):
            c.start("mixed_delay_pressure")

    def ready_for_relief(self, c):
        c.start("delay_to_pressure")
        self.clock.advance(1)
        self.phase(c, "degraded")
        c.prepare_relief()
        self.clock.advance(1)
        c.dispatch_relief()

    def test_slow_start_witness_cannot_hide_relief_start_deadline(self):
        c = self.make()
        self.ready_for_relief(c)
        original = self.pressure.sample

        def slow_sample():
            self.clock.advance(1.8)
            return original()

        self.pressure.sample = slow_sample
        with self.assertRaises(ValueError):
            c.begin_phase("relief")
        self.assertTrue(self.pressure.closed)

    def test_cleanup_rechecks_ownership_after_property_read(self):
        c = self.make()
        c.start("mixed_delay_pressure")

        def lose_owner(_):
            self.owned = False
            return self.value

        c.element.get_property = lose_owner
        self.writes.clear()
        self.assertFalse(c.close())
        self.assertEqual(self.writes, [])
        self.assertTrue(self.pressure.closed)

    def test_interrupt_during_activation_cleans_both_resources_before_propagating(self):
        c = self.make()

        def interrupted():
            Pressure.start(self.pressure)
            raise KeyboardInterrupt()

        self.pressure.start = interrupted
        with self.assertRaises(KeyboardInterrupt):
            c.start("mixed_delay_pressure")
        self.assertEqual(self.value, 0)
        self.assertTrue(self.pressure.closed)

    def test_witness_detects_delay_change_during_pressure_read(self):
        c = self.make()
        c.start("mixed_delay_pressure")
        original = self.pressure.sample

        def changed():
            self.value = 25000
            return original()

        self.pressure.sample = changed
        with self.assertRaises(ValueError):
            c.witness()
        self.assertTrue(self.pressure.closed)

    def test_pressure_activation_consumes_original_condition_budget(self):
        c = self.make()
        original = self.pressure.start

        def stalled():
            original()
            self.clock.advance(20)

        self.pressure.start = stalled
        with self.assertRaises(ValueError):
            c.start("mixed_delay_pressure")
        self.assertEqual(self.value, 0)
        self.assertTrue(self.pressure.closed)
        self.assertEqual(len(self.timers), 1)

    def test_relief_has_its_own_five_second_limit_even_within_phase_limit(self):
        c = self.make()
        self.ready_for_relief(c)
        self.clock.advance(1.7)
        c.begin_phase("relief")
        self.clock.advance(3.4)
        with self.assertRaises(ValueError):
            c.finish_phase()
        self.assertTrue(self.pressure.closed)

    def test_clock_regression_cannot_continue_measurement(self):
        c = self.make()
        c.start("mixed_delay_pressure")
        self.clock.advance(1)
        c.begin_phase("degraded")
        self.clock.ns = 0
        with self.assertRaises(ValueError):
            c.witness()
        self.assertTrue(self.pressure.closed)

    def test_phase_witness_and_event_access_cannot_rewrite_retained_evidence(self):
        c = self.make()
        c.start("mixed_delay_pressure")
        self.clock.advance(1)
        witness = c.begin_phase("degraded")
        witness["delay_us"] = 123
        events = c.events
        events[-1]["witness"]["delay_us"] = 456
        self.assertEqual(c.events[-1]["witness"]["delay_us"], 34000)
        c.close()

    def test_cannot_transition_after_cadence_dispatch(self):
        c = self.make()
        self.ready_for_relief(c)
        with self.assertRaises(ValueError):
            c.prepare_relief()
        self.assertTrue(self.pressure.closed)

    def test_lost_pressure_child_fails_measurement_and_reaps_every_child(self):
        c = self.make()
        c.start("mixed_delay_pressure")
        self.pressure.lost = True
        with self.assertRaises(ValueError):
            c.witness()
        self.assertEqual(self.value, 0)
        self.assertTrue(self.pressure.closed)

    def test_property_cleanup_error_does_not_skip_pressure_cleanup(self):
        c = self.make()
        c.start("mixed_delay_pressure")

        def fail_clear(*_):
            raise OSError("property cleanup failed")

        c.element.set_property = fail_clear
        self.assertFalse(c.close())
        self.assertTrue(self.pressure.closed)
        self.assertFalse(self.timers[0].cancelled)

    def test_restored_resources_after_deadline_still_make_source_expired(self):
        c = self.make()
        c.start("mixed_delay_pressure")
        self.clock.advance(19)
        original = self.pressure.close

        def slow_close():
            self.clock.advance(2)
            return original()

        self.pressure.close = slow_close
        self.assertTrue(c.close())
        self.assertTrue(c.failed)
        self.assertTrue(c.expired)
        self.assertEqual(self.value, 0)

    def test_fresh_post_reference_detects_new_foreign_setting_without_clearing_it(self):
        c = self.make()
        c.start("mixed_delay_pressure")
        self.assertTrue(c.close())
        self.assertEqual(c.reference_witness()["pressure"]["active_workers"], 0)
        self.value = 25000
        self.writes.clear()
        with self.assertRaises(ValueError):
            c.reference_witness()
        self.assertEqual(self.writes, [])


if __name__ == "__main__":
    unittest.main()
