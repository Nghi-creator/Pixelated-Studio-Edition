# Candidate independent container CPU observation

`engine/runtime/research/resource_observation` supplies opt-in read-only
measurement components. Generic cgroup counters are separate from condition
ownership witnesses, configured fault doses and owned-worker identities. These
components do not establish diagnostic labels, empirical acceptance or acquisition
authority. The resource source uses a separate explicit launcher mode; ordinary peer schemas
remain unchanged.

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
factory for tests. CPU counter I/O begins at the first measured reference read. A separate
preparation pass constructs the sampler and establishes eligibility first.

The new class adds `container_cpu_read` beside existing worker read metadata for
healthy/post reference samples and measured degraded/relief/recovery samples.
It fixes quota/period at 200000/100000 microseconds. A controller clock identity
is derived from the observation method, declared worker generation and controller
origin. The supplied clock callback uses the controller's elapsed time, matching
its phase markers. Changing generation/origin fails observation; it does not
create a replacement sampler. Sampling outside those fixed seams is rejected.

Healthy/post reference completion additionally requires at least two seconds
between the first read's end and last read's start on **each** of the CPU and
worker clocks independently. A pre-read observer timestamp spanning two seconds
is insufficient. The new observer retains its existing reference rows and waits
for a fresh sample when either actual read span is short; it does not emit a
reference, clear rows, or advance the stage early. Overlong windows/changed clocks
fail rather than extending limits. The two clocks are never subtracted from one
another. Ordinary condition reference collection remains unchanged.

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

## Explicit launcher and passive inspection

The only resource modes are
`engineering-n11-resource-condition-no_injected_fault`,
`engineering-n11-resource-condition-owned_identity_delay` and
`engineering-n11-resource-condition-owned_cpu_pressure`. They select the new
observer; ordinary condition modes select their original class. Relay assets,
container entry point and acquisition method/role use that same closed routing.
No arbitrary condition, worker command or resource parameter is accepted.

The observer emits one `n11_resource_context` before resource samples. Its clock
hash binds method, generation and controller origin. The origin is a decimal
string so Python/JavaScript transport preserves nanosecond integer identity.
It remains an internal declared clock, without N9 latency authority.

`inspectResourceConditionAcquisition(run, {condition})` first verifies independent
condition ownership, cadence restoration, native source continuity and cleanup.
It then verifies the exact CPU schema, quota/file lifetime/clock, contiguous
sequences, nondecreasing counters, sample budgets and controller-clock containment
in all five windows. It rejects missing/foreign/late/resource-labelled fields,
overlong reads, gaps and windows. Required windows have4–64 samples, at least2s
inner duration, at most5s outer duration, at most1.5s adjacent outer gap and15s
between-window gap; total samples are at most128. Read start must follow the
associated observer timestamp within50ms. Ordinary inspection rejects resource
metadata rather than interpreting it as ordinary condition evidence.

Prepare a source-bound one-shot engineering plan with:

```sh
node engine/runtime/scripts/research/n11/resourceConditionObservation.mjs prepare \
  --image sha256:IMAGE_DIGEST --acquisition-id n11-raw-resource-CASE \
  --core-revision CORE_GIT_REVISION --condition no_injected_fault --output plan.json
```

The explicit acquisition command is:

```sh
node engine/runtime/scripts/research/n11/resourceConditionObservation.mjs acquire \
  --plan plan.json --output-directory fresh-case-directory
```

Preparation creates no acquisition. Acquiring requires matching canonical plan,
current revision and source hashes. It exclusively allocates the output and
attempt marker, retains failures and never retries or overwrites a case. Successful
inspection writes `control-receipt.json` and `resource-observation.json`; the latter
binds the exact `acquisition.json` byte hash, context, identity, windows and samples.
All three ordinary phase bundles are also exported under the distinct
`contained-resource-condition-source-local-v1` compatibility group, common to the
three conditions and containing no active condition name/dose.

The core operator's `verify_native_exports.py` replays both the resource receipt
and byte-bound auxiliary export before checking SDK/CLI phase windows and the
N2/N3 response. Use `check_resource_inspector.py --producer ROOT` for a synthetic
cross-repo replay/tamper check. Existing N3 features and recognition methods do
not automatically consume CPU records. Linux sampler/seam checks do not replace
a complete contained acquisition or prospective recognition study. Engineering
cases remain outside study fitting/evaluation; software success grants no
independent-session, diagnostic, probe-benefit or physical-latency acceptance.


## Engineering-only call-path timing diagnostics

The ordinary resource observer remains the default. An explicit
`resourceTimingDiagnostics: true` option to `runNativeBrowserAcceptance` is
accepted only for a resource-condition mode. It sets the private container flag
`N11_RESOURCE_TIMING_DIAGNOSTICS=1`, selecting `ResourceTimingObservation`.
Non-resource modes and untyped flags are rejected before native work.
The acquisition is marked `n11-resource-observer-timing-diagnostic-v1`.
This is an engineering diagnostic path, not a prospective recognition mode.

The observer records at most four traces: the first two measured references in
healthy and post. Each has at most24nested component spans, including eligibility/
readiness, identity, native/resource metadata, context emission, sampler
construction/read and ownership witness. Trace output is deferred until after
the reference call. No sample/observer timestamps are rewritten and no source
lag/read/window/action/fault limits change. Eligibility polls without a
measurement emit no trace. Failure propagates and cleanup remains available.

`inspectResourceTimingDiagnostics` validates the exact diagnostic schema, bounds,
sequence and clock, and binds complete traces to their original CPU samples.
It reports observer-to-reference-entry, observer-to-read-start, read span and
nested component elapsed durations. Overlapping nested spans must not be summed
as independent CPU costs. Elapsed time includes descheduling and output/file
waits; a long component span locates delay in a call path but does not prove its
operating-system cause. Instrumentation itself has overhead and may perturb the
run. Ordinary resource/ownership/source inspection remains required separately;
a valid diagnostic trace does not make an invalid resource sample acceptable.
Diagnostic acquisitions must stay excluded from study fitting/evaluation.


## Preparation before measured references

The prepared source recipe adds
`reference_preparation: n11-resource-reference-preparation-candidate-v1` and
`maximum_preparation_ns: 1000000000` to its canonical plan declaration.
Before the first healthy measurement, a dedicated reference pass checks the
source/target/readiness/identity, publishes the controller clock context and
constructs the sampler. It performs no CPU sample, takes no warm-up counter read,
leaves the reference rows/sequence untouched and returns without collecting.
The next normal tick rechecks readiness and uses that tick's original timestamp.
Setup does not overwrite or backdate any recorded timestamp. A subsequent
measurement stall still violates the existing50ms association requirement.

A unique `n11_observer_prepared` record brackets the preparation on its declared
controller clock and states `measurement_samples_taken: 0`. Successful setup and
unsuccessful readiness attempts are each limited to one second of elapsed work;
failures latch, with existing cleanup still available. Sampler source/quota and
generation/origin stay pinned. The inspector requires exact preparation schema,
clock/budget, zero measurements and completion strictly before the first healthy
sample's observer timestamp. Missing, duplicate, overlapping, sampled, over-budget
or wrong-clock preparation records are rejected.

This isolates known one-time setup from measured reference collection. It does
not prove that setup caused a historical stall or guarantee future scheduling
latency. No observer lag/read/window minimum, missingness rule, action/fault
lifetime, classifier coordinate, distance or acceptance criterion is relaxed.
Historical sources and cohorts remain frozen under their original source pins;
new prospective collection requires review of the changed source recipe.

### Passive cadence failure diagnostics

The contained resource observer can retain one `n11-cadence-failure-diagnostic-v1`
record from an aborted private cadence operation. It freezes the first failed
controller check and its already-read typed snapshot before restoration. When the
worker port supplied health checks, the record distinguishes native validity,
connection/progress, receiver freshness/progress and capture health. A null check
means that short-circuit evaluation did not read that source. Exceptions carry a
fixed `control_exception` code with no exception text or invented snapshot.

The optional `probe_result.diagnostic` field is closed, versioned, bound to the
same request/result envelope and allowed only for aborted results. Existing result
shapes remain valid. The operation handle copies the record by value. Resource
checkpoint emits it before pacing cleanup, so a cleanup error cannot hide the
primary observation. No additional native/capture/receiver reads, setter calls,
leases or action budget are granted by diagnostics. Missing or invalid diagnostic
details never convert a failed operation to success. This identifies the observed
failed guard; it does not authenticate an external cause or establish diagnosis.

The original combined v3 failure remains unchanged and has no such diagnostic.
Its early health abort cannot be retrospectively attributed to receiver, native
progress, capture identity or scheduling from the generic result alone. Any new
source uses fresh pins and engineering qualification before a prospective study.

Resource checkpoint also emits one `n11_cadence_operation_checkpoint` before
cleanup, using the local operation handle's versioned
`n11-cadence-operation-checkpoint-v1` summary. A terminal summary distinguishes
`rejected` (with its existing rejection code), `worker_lost` (without an invented
result), and `observed` (with the typed controller result). An unfinished operation
is reported as `pending` without partially published terminal fields. This passive
record is independent of journal creation and cannot admit, retry, cancel or
restore an operation. Repeated checkpoint calls do not duplicate it. It covers the
observability gap exposed by combined v4's failed owned-delay case, whose old raw
record cannot retrospectively establish a rejection or worker-loss reason.

### Matching the study's host process lifetime

`scripts/research/n11/conditionEngineering.mjs` is an acquisition-only engineering
runner that retains one Node process across all cases and synchronous core
verification, like `combinedResourceStudy.mjs`. A Python loop launching a fresh
Node child per case does not exercise that process lifetime; successful results
from that topology cannot establish that the long-lived study host is reliable.
This execution difference is not itself evidence of a memory/GC or other cause.

The CLI takes an absolute JSON configuration path and its exact `sha256:` byte
hash. Configuration declares `scope: "engineering_only_no_study_admission"`,
`retryAllowed: false`, a fixed `maximumAcquisitions` (1–36), absolute `directory`
and `coreDirectory`, `sourceManifestHash`, pinned `dependencyFiles` including the
runner, an absolute `verificationCommand`, and fixed `cases`. Each case has a
fresh `n11-raw-eng-` ID, condition, absolute plan path/hash, and its exact numbered
output path under `directory/cases/`. Prepare all canonical resource plans first;
create the output parent and leave every case output/attempt absent. Supply the
existing verifier with `--write-derived` and the fixed policy; no fit/score command
is used by this runner.

Source/dependency/plan checks precede every attempt. An exclusive run-start file
prevents resume; any acquisition/verification failure closes the remaining suffix.
Verification bytes are preserved, and PID/memory-after-case records describe the
host process outside measurement windows. A durable supervisor supplies the
aggregate deadline. Every allocated engineering ID remains excluded from studies,
including unstarted cases. These runs neither authorize prospective study collection
nor establish classifier/diagnostic acceptance.

Combined v5's first-failure record identified `negotiation_deadline`: configured
24 FPS, negotiated 30 FPS, with all recorded health/settings/generation checks
passing. The controller restored successfully; the run remains failed. A controlled
clock drill separately proved that final preimage-check time was being charged
against application settling. The corrected source anchors that clock immediately
before the setter attempt, preserving the 100 ms numeric policy and original
action/watchdog/reservation deadlines. A setter is refused if preparation consumed
the original action window. This is a clock-anchor correction, not an increase in
the limit or retrospective acceptance of v5. The old record lacks timing brackets,
so the drill does not prove how much pre-check delay that specific attempt had.

### Counter-specific timing diagnostics (no analytical adoption)

Private peer IPC v4 adds optional `encoded_counter_read` metadata with separately
identified `native-encoded-counter-read-brackets-v1` semantics. The worker brackets
the existing encoded-buffer property read exactly once and binds its returned value
inside the unchanged whole-snapshot bounds. Resource evidence adds the same
worker-generation clock, explicit reported-counter-only scope and unauthenticated
underlying freshness. Missing/failed counter reads produce no invented timing.
Parent validation rejects value mismatch, out-of-bounds/reversed times, malformed
fields and mixed old transport versions; coherent frozen source bundles retain
their own original transport implementation.

The original `native_read` remains a whole-snapshot read. The current combined
projection still uses it with the encoded 100 ms limit; CPU reads separately retain
50 ms. The new diagnostic field is not an alternative accepted input or a fallback.
V6 correctly remained unavailable for its 101.255250 ms composite read. Its earlier
71.873001 ms composite read was below the actual encoded limit and did not reject
that response. No old encoded read can be narrowed retrospectively: the new point
brackets did not exist in old data.

Any analytical adoption of the new timing needs a separately versioned source/
projection contract and fresh prospective validation, preserving full metadata
bounds, phase/clock/value identity, all samples, minimum duration, missingness and
numeric eligibility gates. A preemption during the encoded getter must remain
visible; no clipping, dropping an inconvenient sample or refreshing its timestamp.
This records a read of a reported internal counter, not authenticated frame event
time, physical capture latency or an N9 clock-authority upgrade.
