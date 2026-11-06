"""Private cgroup sampler fixtures; no native measurement or empirical acceptance."""

import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[4]))
from research.resource_observation import cgroup_cpu as cpu

CLOCK = "controller-monotonic-" + "a" * 64


class Clock:
    def __init__(self):
        self.now = 0

    def __call__(self):
        self.now += 1_000_000
        return self.now


class CgroupCpuTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.directory = Path(self.temporary.name)
        self.root = self.directory / "cgroup"
        self.root.mkdir()
        self.membership = self.directory / "membership"
        self.membership.write_text("0::/\n")
        self.write_counters()
        (self.root / "cpu.max").write_text("200000 100000\n")
        self.clock = Clock()

    def write_counters(self, **changes):
        counters = dict.fromkeys(cpu.COUNTERS, 100)
        counters.update(changes)
        (self.root / "cpu.stat").write_text(
            "".join(f"{key} {value}\n" for key, value in counters.items())
        )

    def sampler(self, **changes):
        arguments = dict(
            clock_id=CLOCK,
            expected_quota_us=200000,
            expected_period_us=100000,
            clock=self.clock,
            root=self.root,
            membership=self.membership,
        )
        arguments.update(changes)
        return cpu.CgroupCpuSampler(**arguments)

    def assert_failed_sticky(self, sampler):
        with self.assertRaisesRegex(ValueError, cpu.ERROR):
            sampler.sample()
        with patch.object(sampler, "_read") as read:
            with self.assertRaisesRegex(ValueError, cpu.ERROR):
                sampler.sample()
            read.assert_not_called()

    def test_constructor_does_no_io_and_sampling_preserves_file_bytes(self):
        with patch.object(cpu, "_read_file") as read:
            sampler = self.sampler()
            read.assert_not_called()
        before = {p: p.read_bytes() for p in (*self.root.iterdir(), self.membership)}
        sample = sampler.sample()
        self.assertEqual(before, {p: p.read_bytes() for p in before})
        self.assertEqual(sample["method"], cpu.METHOD)
        self.assertEqual(sample["quota"], dict(quota_usec=200000, period_usec=100000))
        self.assertEqual(sample["counters"], dict.fromkeys(cpu.COUNTERS, 100))
        self.assertEqual(sample["sequence"], 0)
        self.assertFalse(sample["live_authority"])
        self.assertNotIn("condition", sample)
        self.assertNotIn("pid", sample)

    def test_increasing_counters_and_sequence_and_detached_return_values(self):
        sampler = self.sampler()
        first = sampler.sample()
        first["source_identity"]["cgroup"]["inode"] = -1
        first["counters"]["usage_usec"] = 10000
        first["quota"]["quota_usec"] = 1
        self.write_counters(usage_usec=101)
        second = sampler.sample()
        self.assertEqual(second["sequence"], 1)
        self.assertEqual(second["counters"]["usage_usec"], 101)
        self.assertEqual(second["quota"]["quota_usec"], 200000)
        self.assertGreater(second["read_start_ns"], first["read_end_ns"])

    def test_each_counter_reset_latches_failure(self):
        for key in cpu.COUNTERS:
            with self.subTest(counter=key):
                self.write_counters()
                sampler = self.sampler()
                sampler.sample()
                self.write_counters(**{key: 99})
                self.assert_failed_sticky(sampler)

    def test_private_namespace_required_at_each_sample(self):
        sampler = self.sampler()
        sampler.sample()
        self.membership.write_text("0::/another\n")
        self.assert_failed_sticky(sampler)

    def test_membership_change_during_read_rejected(self):
        original = cpu._read_file

        def changed(name, **kwargs):
            result = original(name, **kwargs)
            if name == "cpu.max":
                self.membership.write_text("0::/moved\n")
            return result

        with patch.object(cpu, "_read_file", side_effect=changed):
            self.assert_failed_sticky(self.sampler())

    def test_same_ratio_quota_change_is_still_context_change(self):
        sampler = self.sampler()
        sampler.sample()
        (self.root / "cpu.max").write_text("400000 200000\n")
        self.assert_failed_sticky(sampler)

    def test_expected_quota_required_without_inferred_fallback(self):
        self.assert_failed_sticky(self.sampler(expected_quota_us=100000))

    def test_source_file_replacement_and_symlink_rejected(self):
        for name in ("cpu.stat", "cpu.max"):
            with self.subTest(name=name):
                path = self.root / name
                original = path.read_bytes()
                sampler = self.sampler()
                sampler.sample()
                replacement = self.root / "replacement"
                replacement.write_bytes(original)
                os.replace(replacement, path)
                self.assert_failed_sticky(sampler)
                target = self.directory / (name + "-target")
                target.write_bytes(original)
                path.unlink()
                path.symlink_to(target)
                self.assert_failed_sticky(self.sampler())
                path.unlink()
                path.write_bytes(original)

    def test_root_directory_replacement_rejected(self):
        sampler = self.sampler()
        sampler.sample()
        self.root.rename(self.directory / "old")
        self.root.mkdir()
        self.write_counters()
        (self.root / "cpu.max").write_text("200000 100000\n")
        self.assert_failed_sticky(sampler)

    def test_root_symlink_rejected(self):
        alias = self.directory / "alias"
        alias.symlink_to(self.root, target_is_directory=True)
        self.assert_failed_sticky(self.sampler(root=alias))

    def test_missing_files_and_invalid_namespace_no_zero_fallback(self):
        (self.root / "cpu.stat").unlink()
        self.assert_failed_sticky(self.sampler())

    def test_read_failure_is_sticky(self):
        sampler = self.sampler()
        with patch.object(cpu, "_read_file", side_effect=OSError("unavailable")):
            self.assert_failed_sticky(sampler)

    def test_read_span_boundary_and_wide_read_rejection(self):
        sampler = self.sampler(clock=iter((1, 1 + cpu.MAX_READ_SPAN_NS)).__next__)
        self.assertEqual(sampler.sample()["read_end_ns"], 1 + cpu.MAX_READ_SPAN_NS)
        self.assert_failed_sticky(self.sampler(clock=iter((1, 2 + cpu.MAX_READ_SPAN_NS)).__next__))

    def test_clock_values_and_nonincreasing_inter_sample_times_rejected(self):
        for values in ((2, 1), (-1, 1), (True, 1), (1.0, 2), (2**63, 2**63 + 1)):
            with self.subTest(values=values):
                self.assert_failed_sticky(self.sampler(clock=iter(values).__next__))
        sampler = self.sampler(clock=iter((1, 2, 2, 3)).__next__)
        sampler.sample()
        self.assert_failed_sticky(sampler)

    def test_sample_budget_bounded_without_automatic_retry(self):
        sampler = self.sampler()
        for sequence in range(cpu.MAX_SAMPLES):
            self.assertEqual(sampler.sample()["sequence"], sequence)
        self.assert_failed_sticky(sampler)

    def test_parse_stat_required_fields_ascii_duplicates_and_bounded_numbers(self):
        baseline = (self.root / "cpu.stat").read_bytes()
        for data in (
            baseline.replace(b"usage_usec 100\n", b""),
            baseline + b"usage_usec 1\n",
            baseline.replace(b"100", b"-1", 1),
            baseline.replace(b"100", b"1.0", 1),
            baseline + b"unknown x\n",
            baseline + b"\xff\n",
            b"x" * (cpu.MAX_FILE_BYTES + 1),
            baseline.replace(b"100", str(2**63).encode(), 1),
        ):
            with self.subTest(data=data[:40]), self.assertRaises(ValueError):
                cpu.parse_cpu_stat(data)
        self.assertEqual(
            cpu.parse_cpu_stat(baseline + b"future_counter 1\n"), dict.fromkeys(cpu.COUNTERS, 100)
        )
        self.assertEqual(
            cpu.parse_cpu_stat(
                baseline.replace(b"usage_usec 100", b"usage_usec 9223372036854775807")
            )["usage_usec"],
            2**63 - 1,
        )

    def test_parse_quota_strict_finite_positive(self):
        for data in (
            b"max 100000",
            b"0 100000",
            b"1 0",
            b"-1 1",
            b"1.0 1",
            b"1 1 extra",
            b"",
            b"1 \xff",
            b"1 " + b"9" * 20,
        ):
            with self.subTest(data=data), self.assertRaises(ValueError):
                cpu.parse_cpu_max(data)
        self.assertEqual(
            cpu.parse_cpu_max(b"200000 100000\n"), dict(quota_usec=200000, period_usec=100000)
        )

    def test_malformed_sample_latches_and_cannot_recover_after_fix(self):
        sampler = self.sampler()
        (self.root / "cpu.stat").write_text("usage_usec -1\n")
        with self.assertRaises(ValueError):
            sampler.sample()
        self.write_counters()
        self.assert_failed_sticky(sampler)

    def test_oversized_file_rejected_at_read_boundary(self):
        (self.root / "cpu.stat").write_bytes(b" " * (cpu.MAX_FILE_BYTES + 1))
        self.assert_failed_sticky(self.sampler())

    def test_invalid_declarations_rejected_before_io(self):
        for change in (
            dict(clock_id="worker-monotonic-" + "a" * 64),
            dict(clock_id="bad"),
            dict(expected_quota_us=True),
            dict(expected_period_us=0),
            dict(clock=None),
        ):
            with self.subTest(change=change), self.assertRaises(ValueError):
                self.sampler(**change)

    def test_fifo_is_rejected_without_blocking_open(self):
        path = self.root / "cpu.stat"
        path.unlink()
        os.mkfifo(path)
        self.assert_failed_sticky(self.sampler())

    def test_unexpected_clock_failure_is_sticky(self):
        def unavailable():
            raise RuntimeError("clock unavailable")

        self.assert_failed_sticky(self.sampler(clock=unavailable))

    def test_root_swap_during_read_rejected(self):
        original = cpu._read_file

        def swapped(name, **kwargs):
            result = original(name, **kwargs)
            if name == "cpu.max":
                self.root.rename(self.directory / "old")
                self.root.mkdir()
                self.write_counters()
                (self.root / "cpu.max").write_text("200000 100000\n")
            return result

        with patch.object(cpu, "_read_file", side_effect=swapped):
            self.assert_failed_sticky(self.sampler())


if __name__ == "__main__":
    unittest.main()
