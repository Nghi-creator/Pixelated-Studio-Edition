# Candidate independent container CPU observation

`engine/runtime/research/resource_observation` supplies opt-in read-only
measurement components. Generic cgroup counters are separate from condition
ownership witnesses, configured fault doses and owned-worker identities. These
components do not establish diagnostic labels, empirical acceptance or acquisition
authority. They do not add a launcher mode or change ordinary peer schemas.

## Sampler

`cgroup_cpu.CgroupCpuSampler` uses method
`n11-private-cgroup-cpu-read-candidate-v1`. Construction performs no I/O and
emits no events. Callers explicitly supply:

- `clock_id`, using `controller-monotonic-` plus 64 hexadecimal digits;
- positive `expected_quota_us` and `expected_period_us`;
- optionally a clock callback and filesystem paths for tests.

Default paths are `/sys/fs/cgroup` and `/proc/self/cgroup`; the default clock is
`time.monotonic_ns`. The caller must bind the clock label to that callback's origin
and observation context. Labels alone do not authenticate a clock or execution.

Each `sample()` brackets the complete read and parsing operation. It requires a
private cgroup-v2 membership declaration `0::/`, finite `cpu.max` matching the
exact declared quota/period, and nonnegative integer CPU statistics:
`usage_usec`, `user_usec`, `system_usec`, `nr_periods`, `nr_throttled`,
`throttled_usec`. Extra well-formed numeric kernel counters are ignored. Required
fields, ASCII grammar, duplicate keys and integer bounds are checked explicitly.
No host-allocation or missing-counter fallback is used.

Reads are bounded to 8 KiB per file and regular files opened without following
final symlinks. Nonblocking opens allow special files such as FIFOs to be rejected
without waiting for a writer. Directory and counter-file device/inode identities
are checked around reads and pinned across successful samples. Membership is
checked before and after the read. Every counter must remain nondecreasing;
quota, source identity and clock ordering must remain fixed. Read brackets must
be at most 50 ms and later samples must start after the previous read ended.
At most 128 samples are allowed. These are fixed engineering limits, not learned
recognition thresholds.

Any read, parse, clock, lifetime, quota, counter or budget failure raises
`ValueError` and permanently fails that sampler instance. It cannot retry or
silently resume after a repaired file. No partial sample or zero-filled record
is emitted. File descriptors close on return/failure; the sampler creates no
files, processes, timers or ownership leases.

A successful record contains sequence, controller clock/read brackets, generic
counters, quota/period and source file identities. Counter fields ending in
`_usec` are microseconds; `nr_` fields are counts. These are cumulative counters,
not a CPU percentage. Consumed CPU seconds per wall second and quota-normalized
utilisation would require a separately specified same-source delta response.
Throttled time must not be clipped into an assumed wall-time percentage.
Read brackets and file identity do not authenticate counter update freshness or
physical source authenticity.

## Contained observer seam

`contained_condition.ResourceConditionObservation` subclasses the existing
condition observer under method `n11-contained-condition-resource-candidate-v1`.
Like the other contained observers, importing it requires the runtime root and
`engine/runtime/scripts/research/n10` on the Python import path. Its constructor
accepts the original condition observer arguments and an injectable sampler
factory for tests. Resource I/O is lazy, beginning at the first reference read.

The new class adds `container_cpu_read` beside existing worker read metadata for
healthy/post reference samples and measured degraded/relief/recovery samples.
It fixes quota/period at 200000/100000 microseconds. A controller clock identity
is derived from the observation method, declared worker generation and controller
origin. The supplied clock callback uses the controller's elapsed time, matching
its phase markers. Changing generation/origin fails observation; it does not
create a replacement sampler. Sampling outside those fixed seams is rejected.

The resource record has no condition name, dose or owned-worker fields. Standard
ownership witnesses remain separate. Native encoded-buffer read brackets retain
their worker clock; subtracting resource and worker timestamps is not allowed.
Combining source-local response coordinates would not establish N9 latency
alignment or physical capture latency.

The base driver takes its tick timestamp before calling the added reader. This
new observer therefore publishes phase completion on a fresh controller timestamp
after the last resource read in that phase. It rejects completion preceding that
read, a mismatched phase, phase duration beyond 4.5 seconds, relief completion at
or beyond the five-second action limit, and reads after the twenty-second owned
condition limit. These limits are not extended to accommodate overhead.

Source failures latch while inherited condition cleanup remains available.
The driver must still run its existing checkpoint/cleanup path in `finally`.
The observer does not replace that cleanup responsibility or change the ordinary
condition observer's timing/output.

## Integration boundary

Before fixture collection, add an explicit new launcher mode and a passive
inspector for resource schema, source identity/quota consistency, controller
clock and phase containment, sample completeness and cleanup. Source hashes,
export/custody, availability rules and independent ownership witness checks must
cover the new mode. Then qualify its overhead/failure behavior and prepare a
reviewed bounded engineering recipe. The standalone sampler's Linux filesystem
test is not validation of the complete observer or recognition of conditions.
