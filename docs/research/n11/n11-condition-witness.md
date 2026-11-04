# Common owned-condition witness fixture

`n11-contained-condition-witness-v1` is a default-off engineering protocol for the
contained Frozen-Bubble/Linux fixture. It observes three closed conditions:

| Condition | Owned identity sleep-time | Owned pressure workers |
| --- | --- | --- |
| `no_injected_fault` | 0 us | 0 |
| `owned_identity_delay` | 34,000 us | 0 |
| `owned_cpu_pressure` | 0 us | 2 |

These are fixture conditions, not diagnostic labels. Zero owned faults does not
establish global host health. The fixed 34,000 us recipe comes from prior engineering
capacity work; behavior on changed source/image still needs qualification. There is
no arbitrary delay, worker count, remote setter or automatic diagnostic dispatch.

Build the engine, then prepare one source-bound plan explicitly:

```sh
node engine/runtime/scripts/research/n11/conditionObservation.mjs prepare \
  --image sha256:<cached-image-id> \
  --acquisition-id n11-raw-condition-example \
  --core-revision <full-core-revision> \
  --condition no_injected_fault \
  --output /absolute/private/condition-plan.json
node engine/runtime/scripts/research/n11/conditionObservation.mjs acquire \
  --plan /absolute/private/condition-plan.json \
  --output-directory /absolute/private/condition-example
```

Plans bind source bytes, both revisions, immutable image and fixed recipe. Preparation
is exclusive. Acquisition rejects changed plans/source, symlink plan files and a
reused attempt lease. Preserve failed prefixes; never replace a failure or retry a
completed protocol to improve an effect. A future study must separately freeze its
truth review, groups, roles, counts and stop rules before collection.

All arms use the same paced worker wrapper, native counter timing, healthy/post
reference sampling, property acknowledgement and 30→24→30 FPS cadence protocol.
The five-second action, restoration proof, 20% cadence limit, independent pacing
watchdog, owned pressure deadlines, container bounds and outer deadlines remain.
Even zero delay is explicitly started and stopped, with a worker acknowledgement.
Pressure reuses exact owned children, durable pre-activation identity records,
CPU clocks, cgroup counters, EOF/failsafe and pinned cleanup.

Every reference and whole-phase boundary retains a condition witness: exact source
generation, pacing property/sequence/worker elapsed time, parent read brackets and
owned pressure registry state. Before activation, the property is zero/unstarted
and the registry unused. During phases, the property is held and pressure is either
unused or active with the same two identities/counters. After cleanup, the property
is zero/stopped and the registry is closed-unused or verified reaped. CPU values
for reaped processes are unavailable (`null`); an unused empty registry has no
process counters (`[]`). These states never stand for missing telemetry filled as zero.

`inspectConditionAcquisition` checks controller/restoration, complete phase support,
worker brackets, generation/property continuity, registry/CPU resets and cleanup.
Resource/effect indicators remain descriptive and may be unmet while condition
integrity is complete. Missing/foreign/contradictory witnesses fail. A receipt is an
internal-consistency check, not authentication of runtime execution or external truth.

Exports share `contained-condition-witness-source-local-v1` and one complete recipe
marker across all three arms. The actual active condition/dose is retained in raw
plans/witnesses, excluded from the classifier context. Old pacing, capacity and
contention exports retain separate meanings; do not pool them with this protocol.
Each acquisition's phases remain connected source evidence. A new container or
worker ID does not establish statistical independence.

No receipt assigns healthy/host-contention/capture-slowdown truth, accepts N6 groups,
calibrates a classifier or establishes N11 empirical acceptance. Independent review
must justify the physical association, causal scope, grouping and prospective split.
Worker counter brackets are not same-frame capture latency; existing N5 effect
contracts and existing N6/N7/N8 gates are unchanged.
