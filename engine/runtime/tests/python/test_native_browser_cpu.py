"""Native CPU errors and lifetime changes are distinct from measured zero usage."""

import os
import sys
import time
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts/n10"))
from native_browser_cpu import reader, sample


class NativeBrowserCpuTests(unittest.TestCase):
    def test_timebase_and_lifetime_inventory_are_retained_without_raw_pids(self):
        info = [{"id": 123, "type": "renderer"}]
        value = sample(info, source=("test", lambda pid: (24000000, "456", 125, 3000000000)))
        self.assertEqual(value["cpu_seconds"], 1)
        self.assertEqual(value["process_counters"][0]["cpu_ticks_decimal"], "24000000")
        self.assertNotIn("pid", value)
        self.assertNotIn("pid", value["process_counters"][0])
        changed = sample(info, source=("test", lambda pid: (24000000, "457", 125, 3000000000)))
        self.assertNotEqual(value["inventory_hash"], changed["inventory_hash"])

    def test_invalid_inventory_is_rejected_before_native_reads(self):
        def fail(_):
            self.fail("native read on invalid inventory")
        for info in ([], [{"id": True, "type": "browser"}], [{"id": -1, "type": "browser"}],
                     [{"id": 1, "type": "browser"}] * 2, [{"id": 1, "type": "browser", "cpuTime": 0}]):
            with self.subTest(info=info), self.assertRaises(ValueError):
                sample(info, source=("test", fail))

    def test_failed_read_is_not_zero_but_explicit_measured_zero_is_valid(self):
        def fail(_):
            raise OSError("unavailable")
        with self.assertRaises(OSError):
            sample([{"id": 123, "type": "browser"}], source=("test", fail))
        value = sample([{"id": 123, "type": "browser"}], source=("test", lambda pid: (0, "456", 1, 100)))
        self.assertEqual(value["cpu_seconds"], 0)

    @unittest.skipUnless(sys.platform in ("darwin", "linux"), "native sampling platforms")
    def test_live_native_cpu_matches_getrusage_seconds_not_unscaled_mach_ticks(self):
        import resource

        start = time.process_time()
        while time.process_time() - start < 0.05:
            pass
        _, read = reader()
        before = resource.getrusage(resource.RUSAGE_SELF)
        ticks, identity, numerator, denominator = read(os.getpid())
        after = resource.getrusage(resource.RUSAGE_SELF)
        seconds = ticks * numerator / denominator
        self.assertGreater(int(identity), 0)
        self.assertGreaterEqual(seconds, before.ru_utime + before.ru_stime - 0.02)
        self.assertLessEqual(seconds, after.ru_utime + after.ru_stime + 0.02)
