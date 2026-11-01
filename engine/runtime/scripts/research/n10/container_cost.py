"""Read-only CPU boundary for this disposable private cgroup, including exited tasks."""

import time
from pathlib import Path

METHOD = "n10-private-container-cleanup-cpu-v1"


class ContainerCost:
    def __init__(self, emit):
        self.emit, self.closed = emit, False
        self.action_started, self.action_closed = False, False
        self.path = Path("/sys/fs/cgroup/cpu.stat")
        if Path("/proc/self/cgroup").read_text().strip() != "0::/":
            raise ValueError("private cgroup-v2 namespace required")
        stat = self.path.stat()
        self.identity = stat.st_dev, stat.st_ino
        self.emit(
            "container_cost_started",
            method=METHOD,
            sample=self.sample(),
            live_authority=False,
        )

    def sample(self):
        start = time.monotonic_ns()
        stat = self.path.stat()
        if (stat.st_dev, stat.st_ino) != self.identity:
            raise ValueError("container CPU lifetime changed")
        fields = dict(line.split() for line in self.path.read_text().splitlines())
        values = {k: int(fields[k]) for k in ("usage_usec", "user_usec", "system_usec")}
        if any(v < 0 for v in values.values()):
            raise ValueError("negative container CPU counter")
        return dict(read_start_ns=start, read_end_ns=time.monotonic_ns(), **values)

    def finish(self, *, scene_closed, pulse_reaped, workers_closed, active_peers):
        if self.closed:
            return
        self.closed = True
        try:
            sample, failure = self.sample(), None
        except (OSError, ValueError, KeyError):
            sample, failure = None, "container_CPU_observation_unavailable"
        self.emit(
            "container_cost_finished",
            method=METHOD,
            sample=sample,
            failure=failure,
            scene_closed=scene_closed,
            pulse_reaped=pulse_reaped,
            workers_closed=workers_closed,
            active_peers=active_peers,
            scope="camera_ready_through_cleanup_callbacks",
            excluded_tail="relay_interpreter_container_and_browser_exit",
            live_authority=False,
        )

    def start_action(self):
        if self.action_started:
            raise ValueError("container action span already started")
        self.action_started = True
        self.emit(
            "container_action_cost_started",
            method="n10-private-container-action-cpu-v1",
            sample=self.sample(),
            live_authority=False,
        )

    def finish_action(self, outcome):
        if not self.action_started or self.action_closed:
            return
        self.action_closed = True
        try:
            sample, failure = self.sample(), None
        except (OSError, ValueError, KeyError):
            sample, failure = None, "container_CPU_observation_unavailable"
        self.emit(
            "container_action_cost_finished",
            method="n10-private-container-action-cpu-v1",
            sample=sample,
            failure=failure,
            outcome=outcome,
            scope="baseline_through_restored_end_or_failure_prefix",
            excluded_tail="startup_warmup_and_cleanup",
            live_authority=False,
        )
