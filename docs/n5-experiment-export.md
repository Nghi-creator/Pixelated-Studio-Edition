# N5 experiment bundle export

**Delivered:** Step 6 software, 2026-10-11. [Lifecycle](n5-lifecycle.md),
[adapters](n5-adapters.md), [current handoff](n5-scenario-harness.md).

The stdlib-only `scenario_harness` package exports these functions:

```python
from scenario_harness import (
    experiment_bundle_bytes, unsupported_bundle_bytes, write_experiment_bundle,
)

payload = experiment_bundle_bytes(
    manifest, plan, execution,
    recordings=recordings, observation_windows=observation_windows,
)
write_experiment_bundle(output_path, payload)
```

The campaign owner supplies sanitized frozen manifest metadata, the validated
`RunPlan`, and the `Execution` returned after lifecycle cleanup. `recordings` is
an iterable of `(phase, frozen HostTraceRecording)` pairs for healthy, degraded,
probe and recovery. Use the actual fresh objects returned by recording control;
foreign/reused phases reject. An unfrozen/unavailable snapshot is missing evidence,
not a substituted warm-up or shutdown trace. `observation_windows` is an iterable
of `(N5_phase, sanitized_existing_v2_window_dict)` pairs. Existing v2 aliases,
phase and clock fields remain unchanged. Nested observation validity is checked by
detached core inspection; callers must supply already sanitized closed v2 roots.

The manifest uses the sibling core's frozen `experiment-manifest-v1` contract.
Declare real runtime/tool/workload versions explicitly; export does not infer them
or claim synthetic versions were measured. Exact public fields are required;
private paths, notes, worker identities, journal generations and diagnostic output
are excluded. Run/seed/scenario/workers/durations/trace policy must agree with the
plan. Unavailable adapters use `unsupported_bundle_bytes(manifest)` without
starting runtime work, and produce no phases, actions, artifacts or rates.

Export builds canonical manifest/evidence/result JSON, preserves actual frozen
N4 snapshots, assigns ordered artifact aliases and hashes the exact exported
bytes. The result binds the manifest and each referenced artifact. Gzip USTAR
bytes are deterministic. No core import, network access or I/O enters frame hooks.
Export happens after collectors freeze and cleanup finishes on the control thread.

Missing traces or raw phase evidence retain an aborted source-error result with
unavailable effect. Cancellation and failed effects retain their observed evidence.
Unknown stop/cleanup offsets remain null and cleanup unverified; private final
watchdog timestamps cannot become runner-relative proof. No action startup becomes
verified ground truth. Export trusts the runner's private execution objects;
detached inspection is required before accepting the public claims.

Limits are 20 regular members, 10 MiB per JSON, 64 MiB compressed/expanded bundle.
The private atomic writer pins parents without following symlinks, preserves old
output on failure and publishes mode 0600. N4's standalone writer/32 MiB bounds
and prior research exports are unchanged.

Inspect in the sibling core:

```sh
latency-fingerprint inspect-experiment --bundle experiment.tar.gz --output result.json
```

The core checks exact membership, hashes/lengths, ownership, timing and trace
policy, independently recomputes integer effect thresholds, and writes canonical
`ExperimentResult` silently. Fixed errors do not echo supplied paths or data.
Generic model validation alone does not verify linked evidence. Inspecting hashes
cannot establish fresh source runs, held-out independence or scientific causality.

Six producer export regressions exercise actual synthetic frozen collectors,
determinism, checksums, missing traces, unsupported adapters, unknown cleanup,
private metadata/plan drift and atomic output. Cross-repo API/CLI handoffs pass for
healthy, host contention, failed pressure, unsupported runtime, missing traces and unknown cleanup timing.
No worker pressure or real capture was run. [Independent released fixtures and
reproduction pins](n5-experiment-reproduction.md) are delivered in Step 7; live campaigns/acceptance remain Step 8.
