"""Portable regressions for encoded buffer observation."""

import unittest
from types import SimpleNamespace

from research.live_probe_control.peers.encoded_event_observer import (
    MAX_EVENTS,
    EncodedEventObserver,
)

GST = SimpleNamespace(
    PadProbeType=SimpleNamespace(BUFFER=1, BUFFER_LIST=2),
    PadProbeReturn=SimpleNamespace(OK=0),
)


class EncodedEventObserverTests(unittest.TestCase):
    def setUp(self):
        self.observer = EncodedEventObserver(
            origin_ns=100,
            clock_id="worker-monotonic-" + "a" * 64,
            now=iter(range(100, 100 + 3 * MAX_EVENTS)).__next__,
        )

    def feed(self, flags=1):
        self.assertEqual(
            self.observer._observe(None, SimpleNamespace(type=flags), GST), 0
        )

    def test_records_same_clock_brackets_and_reconciles(self):
        self.feed()
        self.feed()
        result = self.observer.export(identity_count=2)
        self.assertEqual(result["state"], "count_reconciled")
        self.assertEqual(
            [
                (r["event_ordinal"], r["read_start_ns"], r["read_end_ns"])
                for r in result["events"]
            ],
            [(1, 0, 1), (2, 2, 3)],
        )
        result["events"][0]["event_ordinal"] = 9
        self.assertEqual(
            self.observer.export(identity_count=2)["events"][0]["event_ordinal"], 1
        )

    def test_overflow_is_retained_without_growing_storage(self):
        for _ in range(MAX_EVENTS + 1):
            self.feed()
        result = self.observer.export(identity_count=MAX_EVENTS + 1)
        self.assertEqual(result["reason_codes"], ["event_capacity_exceeded"])
        self.assertEqual(len(result["events"]), MAX_EVENTS)

    def test_mismatch_and_buffer_lists_fail_closed(self):
        self.feed()
        self.feed(flags=2)
        result = self.observer.export(identity_count=2)
        self.assertEqual(
            result["reason_codes"],
            ["unsupported_buffer_list", "identity_count_mismatch"],
        )
        self.assertEqual(result["state"], "unavailable")

    def test_empty_trace_cannot_reconcile(self):
        self.assertEqual(
            self.observer.export(identity_count=0)["reason_codes"],
            ["no_encoded_events"],
        )
