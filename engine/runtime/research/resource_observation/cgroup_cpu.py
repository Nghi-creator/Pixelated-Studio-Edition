"""Bounded, read-only private cgroup-v2 CPU samples, independent of fault ownership."""

import os
import re
import stat
import time
from pathlib import Path

METHOD = "n11-private-cgroup-cpu-read-candidate-v1"
ERROR = "invalid_private_cgroup_cpu_observation"
COUNTERS = (
    "usage_usec",
    "user_usec",
    "system_usec",
    "nr_periods",
    "nr_throttled",
    "throttled_usec",
)
MAX_INTEGER = 2**63 - 1
MAX_FILE_BYTES = 8192
MAX_READ_SPAN_NS = 50_000_000
MAX_SAMPLES = 128


def _integer(value, minimum=0):
    if type(value) is not int or not minimum <= value <= MAX_INTEGER:
        raise ValueError(ERROR)
    return value


def _decimal(token, minimum=0):
    if not re.fullmatch(r"[0-9]{1,19}", token):
        raise ValueError(ERROR)
    return _integer(int(token), minimum)


def parse_cpu_stat(data):
    """Strict bounded ASCII grammar; extra numeric kernel counters are ignored."""
    if type(data) is not bytes or len(data) > MAX_FILE_BYTES:
        raise ValueError(ERROR)
    try:
        fields = {}
        for line in data.decode("ascii").splitlines():
            parts = line.split()
            if len(parts) != 2 or not re.fullmatch(r"[a-z_][a-z0-9_]*", parts[0]):
                raise ValueError(ERROR)
            name, token = parts
            if name in fields:
                raise ValueError(ERROR)
            fields[name] = _decimal(token)
        return {name: fields[name] for name in COUNTERS}
    except (UnicodeError, KeyError):
        raise ValueError(ERROR) from None


def parse_cpu_max(data):
    """Require a finite declared quota; no inferred host CPU fallback."""
    if type(data) is not bytes or len(data) > MAX_FILE_BYTES:
        raise ValueError(ERROR)
    try:
        tokens = data.decode("ascii").split()
        if len(tokens) != 2:
            raise ValueError(ERROR)
        return dict(quota_usec=_decimal(tokens[0], 1), period_usec=_decimal(tokens[1], 1))
    except UnicodeError:
        raise ValueError(ERROR) from None


def _identity(metadata):
    return dict(device=metadata.st_dev, inode=metadata.st_ino)


def _read_file(name, *, directory=None):
    fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=directory)
    with os.fdopen(fd, "rb") as stream:
        before = os.fstat(stream.fileno())
        if not stat.S_ISREG(before.st_mode):
            raise ValueError(ERROR)
        data = stream.read(MAX_FILE_BYTES + 1)
        after = os.fstat(stream.fileno())
        if len(data) > MAX_FILE_BYTES or _identity(before) != _identity(after):
            raise ValueError(ERROR)
        return data, _identity(before)


class CgroupCpuSampler:
    """One declared clock/quota/lifetime, with sticky failure and no emissions.

    Construction performs no I/O. Root and membership paths are injectable for
    tests. A supplied clock must use the origin associated with clock_id; this
    label and file identity do not authenticate execution or counter freshness.
    """

    def __init__(
        self,
        *,
        clock_id,
        expected_quota_us,
        expected_period_us,
        clock=time.monotonic_ns,
        root=Path("/sys/fs/cgroup"),
        membership=Path("/proc/self/cgroup"),
    ):
        if (
            type(clock_id) is not str
            or re.fullmatch(r"controller-monotonic-[a-f0-9]{64}", clock_id) is None
            or not callable(clock)
        ):
            raise ValueError(ERROR)
        self.clock_id = clock_id
        self._expected_quota = dict(
            quota_usec=_integer(expected_quota_us, 1), period_usec=_integer(expected_period_us, 1)
        )
        self.root, self.membership, self.clock = Path(root), Path(membership), clock
        self._source = self._previous = None
        self._count, self._failed = 0, False

    def _read(self):
        membership, _ = _read_file(self.membership)
        if membership.strip() != b"0::/":
            raise ValueError(ERROR)
        directory = os.open(self.root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            source = {"cgroup": _identity(os.fstat(directory))}
            data = {}
            for name in ("cpu.stat", "cpu.max"):
                data[name], source[name] = _read_file(name, directory=directory)
            for name in ("cpu.stat", "cpu.max"):
                metadata = os.stat(name, dir_fd=directory, follow_symlinks=False)
                if not stat.S_ISREG(metadata.st_mode) or _identity(metadata) != source[name]:
                    raise ValueError(ERROR)
            root_metadata = os.stat(self.root, follow_symlinks=False)
            if (
                not stat.S_ISDIR(root_metadata.st_mode)
                or _identity(root_metadata) != source["cgroup"]
            ):
                raise ValueError(ERROR)
            # Namespace membership is checked around the complete file read.
            membership_after, _ = _read_file(self.membership)
            if membership_after.strip() != b"0::/":
                raise ValueError(ERROR)
            return source, parse_cpu_stat(data["cpu.stat"]), parse_cpu_max(data["cpu.max"])
        finally:
            os.close(directory)

    def sample(self):
        if self._failed:
            raise ValueError(ERROR)
        try:
            if self._count >= MAX_SAMPLES:
                raise ValueError(ERROR)
            start = _integer(self.clock())
            source, counters, quota = self._read()
            end = _integer(self.clock())
            if not 0 <= end - start <= MAX_READ_SPAN_NS or quota != self._expected_quota:
                raise ValueError(ERROR)
            if self._source is not None and source != self._source:
                raise ValueError(ERROR)
            if self._previous is not None:
                previous_end, previous_counters = self._previous
                if start <= previous_end or any(
                    counters[k] < previous_counters[k] for k in COUNTERS
                ):
                    raise ValueError(ERROR)
            result = dict(
                method=METHOD,
                scope="private_container_cpu_counters_not_ownership_or_diagnosis",
                clock_id=self.clock_id,
                sequence=self._count,
                read_start_ns=start,
                read_end_ns=end,
                source_identity=source,
                quota=quota,
                counters=counters,
                counter_units="microseconds_for_usec_fields_counts_for_nr_fields",
                underlying_counter_freshness="not_authenticated_by_read_brackets",
                source_authenticity="declared_namespace_quota_and_file_identity_only",
                live_authority=False,
            )
            self._source = {key: dict(value) for key, value in source.items()}
            self._previous = (end, dict(counters))
            self._count += 1
            return result
        except Exception:
            # Any read/clock failure consumes this sampler; no implicit recovery.
            self._failed = True
            raise ValueError(ERROR) from None
