"""Bounded passive evidence for existing fresh-source admission reads."""

from collections import deque
from copy import deepcopy

from .contracts import health_checks_value, integer

LIMIT = 32
METHOD = "n11-native-admission-progress-trace-v2"
LEGACY_METHOD = "n11-native-admission-progress-trace-v1"
COUNTERS = ("capture_buffers", "encoded_buffers")


def admission_trace_value(value):
    if type(value) is not dict or set(value) != {"method", "completed_reads", "truncated", "rows"}:
        raise ValueError("closed admission trace required")
    count = integer(value["completed_reads"], 0, 2**53 - 1)
    rows = value["rows"]
    if (value["method"] not in (METHOD, LEGACY_METHOD) or type(value["truncated"]) is not bool
            or value["truncated"] != (count > LIMIT) or type(rows) is not list
            or len(rows) != min(count, LIMIT)):
        raise ValueError("bounded admission trace required")
    prior_end = 0
    for row in rows:
        fields = {
            "read_start_ns", "checked_ns", "previous", "current",
            "progress_at_ns", "healthy", "health_checks",
        }
        if value["method"] == METHOD:
            fields.add("counter_progress_at_ns")
        if type(row) is not dict or set(row) != fields:
            raise ValueError("closed admission read required")
        start = integer(row["read_start_ns"], prior_end, 2**63 - 1)
        prior_end = integer(row["checked_ns"], start, 2**63 - 1)
        integer(row["progress_at_ns"], 0, prior_end)
        if value["method"] == METHOD:
            progress = row["counter_progress_at_ns"]
            if type(progress) is not dict or set(progress) != set(COUNTERS):
                raise ValueError("closed counter progress times required")
            for stamp in progress.values():
                if stamp is not None:
                    integer(stamp, 0, prior_end)
            earliest = min(progress.values()) if all(t is not None for t in progress.values()) else 0
            if row["progress_at_ns"] != earliest:
                raise ValueError("inconsistent counter progress summary")
        if type(row["healthy"]) is not bool:
            raise ValueError("invalid admission decision")
        health_checks_value(row["health_checks"])
        for key in ("previous", "current"):
            counters = row[key]
            if type(counters) is not dict or set(counters) != set(COUNTERS):
                raise ValueError("closed admission counters required")
            for counter in counters.values():
                if counter is not None:
                    integer(counter, 0, 2**53 - 1)
    return value


class AdmissionTrace:
    def __init__(self):
        self.rows = deque(maxlen=LIMIT)
        self.completed_reads = 0

    def record(self, start, checked, previous, current, progress_at, healthy, checks, counter_progress):
        self.completed_reads += 1
        self.rows.append(dict(
            read_start_ns=start, checked_ns=checked,
            previous={k: previous[k] if previous is not None else None for k in COUNTERS},
            current={k: current[k] for k in COUNTERS}, progress_at_ns=progress_at,
            healthy=healthy, health_checks=dict(checks),
            counter_progress_at_ns=dict(counter_progress),
        ))

    def value(self):
        return deepcopy(dict(method=METHOD, completed_reads=self.completed_reads,
                             truncated=self.completed_reads > LIMIT, rows=list(self.rows)))
