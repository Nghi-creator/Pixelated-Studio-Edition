# Persistent contention engineering screen

This separately opt-in procedure adds two owned CPU-pressure children to the
[contained paired collector](n11-paired-observation.md). The existing no-fault
collector remains the default. Pressure is independent of the cadence setter and
persists through comparison, relief and cadence recovery. It is an engineering
feasibility screen, with no accepted diagnostic label or automatic N6 calibration.
It does not qualify N5's longer fixed-setting effect contract.

## Fixed scope and commands

Use the same cached native image, owned Frozen-Bubble scene, one receiver and
existing 2 CPU / 768 MiB / 256 PID container bounds. The action remains one
five-second 30→24→30 cadence request with the existing two-second restoration grace.
Four original browser rows are retained per phase. Source, image and one-shot
custody protections are the same as the no-fault collector.

```sh
npm run build:engine
node --experimental-strip-types engine/runtime/scripts/research/n11/pairedObservation.mjs prepare-contention \
  --image sha256:<cached-native-image-id> \
  --acquisition-id n11-raw-contention-example \
  --core-revision <full-current-core-revision> \
  --output /absolute/private/contention-plan.json
node --experimental-strip-types engine/runtime/scripts/research/n11/pairedObservation.mjs acquire \
  --plan /absolute/private/contention-plan.json \
  --output-directory /absolute/private/contention-example
```

Run the software/Linux gates before allocating the engineering attempt. The plan
fixes two pressure children, a 20-second active limit, two-second native references
before and after pressure, one-second establishment, unavailable labels and no
retry. Do not change intensity or repeat until degradation appears. Retain an
unmet screen and its original values; changed procedures require new plans.

## Pressure ownership and evidence

Both trusted children park before activation. The owner pins their exact pidfds
and generations, fsyncs a private ownership intent for both, then sends GO. This
reuses the existing isolated CPU helper with its independent 40-second failsafe
and EOF-on-parent-loss stop. No child receives a user command, filesystem task,
media setting or network access. All CPU work stays inside the same capped
container; no host or foreign process is stressed.

The owner checks child liveness on each native tick and retains generation-bound
process-CPU counters plus cgroup v2 `nr_periods`, `nr_throttled`, `throttled_usec`.
Only an exactly observable namespaced two-core cgroup is supported. Resource reads
cannot activate load. Paired phase boundaries have explicit resource observations
before start and after end; actual read brackets and source spans are retained.
Do not subtract these source-monotonic times from browser UTC timestamps.

The same children remain active through the complete initial, relief and cadence
recovery phases. The cadence setter cannot stop or reconfigure them. After cadence
recovery, pressure stops by closing owned stdin, with bounded pidfd TERM/KILL
escalation if needed, and exact reaping is required. Then a fresh two-second
native 30 FPS reference is recorded. Failure checkpointing attempts owned pressure
cleanup while retaining controller/journal facts. Unknown cleanup or source loss
cannot qualify a completed screen. Private process IDs stay out of emitted
resource facts and public phase bundles; opaque identity hashes bind the children.

## Interpretation

`control-receipt.json` retains ordinary paired control evidence and adds separate
pressure/reference indicators. In both initial and relief phases, the resource
indicator requires the same two live children over the whole native phase, at
least 50% aggregate CPU usage of one core, and an increase in throttled periods.
The actual support spans, CPU rates and throttling deltas remain visible.

Separate native throughput indicators require a pre-pressure reference of at
least 27 FPS, initial encoded throughput at most 95% of that reference, and
post-cleanup throughput at least 95% of reference. References use at least two
seconds of original same-source counters; long gaps, resets and source changes
are rejected. Intentional 24 FPS relief is never used as proof of fault-induced
media degradation. The screen is `met` only if all these engineering indicators
hold; a complete observation with absent indicators is `unmet`. Missing or invalid
support remains unavailable through the retained failure outcome.

These short engineering checks do not authenticate cause truth, externally confirm
a healthy label, qualify scientific thresholds or establish diagnostic utility.
The result retains `diagnostic_label=null` and zero accepted diagnostic groups.
Independence/label review, N7 availability and positive dispersion, held-out splits,
final-study counts, N9 onset timing and Phase 2 empirical acceptance remain separate.

All phase outputs remain method-1.2 source-local archives, with exact original
acquisition hashes and ordinary N2/N3 checks. Keep all phases connected to one
acquisition group. Existing N5 policies, durations and fixed settings are unchanged.

## Verification

```sh
node --experimental-strip-types --test engine/runtime/scripts/research/n10/contentionReceipt.test.mjs
cd engine/runtime
python3 -m unittest discover -s tests/python/qualification/observation -t tests/python -v
```

The ownership tests use fake processes on the host. The separate real-pressure
lifecycle test requires Linux, `N10_NATIVE_PEER_TESTS=1` and the exact capped
two-core disposable container. Run the full engine and Linux/native suites plus
existing no-fault/production-admission checks when changing shared harness code.
