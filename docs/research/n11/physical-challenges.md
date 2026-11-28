# Physical challenge source requirements

The core's `n11-physical-condition-challenge-recipe-v1` declares three recipes:
simultaneous 34,000 µs owned identity delay plus two pressure workers; delay in
degraded followed by pressure in relief/recovery; and the reverse sequence.
Healthy and post references have neither owned injection. Cadence stays 30/24/30.
The canonical recipe generator and validator live in the sibling core at
`latency_fingerprinting.evaluation.protocols.physical_challenges`; its reusable
guide is `docs/evaluation/study/N11_PHYSICAL_CHALLENGES.md`.

## Current implementation boundary

Existing condition modes deliberately accept only `no_injected_fault`,
`owned_identity_delay` and `owned_cpu_pressure`. `conditionVariant` and
`condition_variant` bind one constant dose to an acquisition. `ConditionObservation`
requires that dose at each phase boundary; the JS condition receipt requires
the same held state across all three phases. The resource mode selector also
has a closed three-condition grammar. These paths must retain their old behavior.

`ElementPacer`/`PacingHandle` implement one start and terminal cleanup, not a
phase transition protocol. `ContainedPressure` and the observer preserve one
owned allocation and terminal reaping. Their primitives are useful building
blocks, but do not already verify simultaneous pressure plus delay, changing
injection state, transition establishment or new-source compatibility.

The separate opt-in acquisition path below is now implemented. Its software
checks do not constitute native qualification or a collection decision.

## Implemented lifecycle primitive

`research.physical_challenges.lifecycle.ChallengeLifecycle` now supplies a
single-use worker-local lifecycle for the three challenge names and three
`control_`-prefixed matched single-condition variants. Its default pressure
factory uses the existing durable `ContainedPressure` registry and child
failsafe. Supply the actual owned fixture identity element, the pinned
owner/pipeline/peer generation, a fresh generation reader and an ownership/health
closure. These caller bindings are not authenticated by importing the class.

`start()` arms one 20-second condition deadline before injection. `begin_phase()`
and `finish_phase()` enforce phase ordering and retain read-bracketed property
and pressure witnesses. `prepare_relief()` changes conditions only after degraded
has ended; `dispatch_relief()` is permitted only after establishment. That method
records a readiness boundary: the caller must immediately dispatch through the
real cadence controller. It does not itself send a command or acknowledge cadence
application. The real controller's setter/health/receiver checks remain required.

Transitions retain the original condition deadline. The guard rechecks deadlines
after witness reads, retains the 1.75-second relief-start and 5-second relief
bounds, and rejects pressure loss, property changes and clock regression.
`close()` independently attempts delay restoration and owned-child reaping; it
does not write after generation/ownership loss. Unconfirmed cleanup cannot be
reported as success or cancel the watchdog. Cleanup can be attempted again for
safety, without reopening a measurement or restarting the lifetime.

Read `events` for detached operation/phase/cleanup records. Activation errors and
interrupts attempt both cleanups before propagating. A local timer cannot
interrupt an arbitrary blocked native call while the lifecycle lock is held;
bounded peer transport and real native timing still require qualification.
Synthetic regressions establish these software branches, not media continuity,
actual resource dose, native deadline success or scientific labels.

Each condition-application event now includes `pressure_start`. When starting
pressure, `n11-physical-pressure-start-v1` retains the helper's original result
and exact durable active-intent JSON between worker-clock brackets. The bounded,
descriptor-relative no-follow read must match the helper's SHA-256 and current
worker identities before any phase can start. Allocation and lifetime declarations
remain two cores, 20 seconds and a 40-second child failsafe. A missing or altered
receipt fails the lifecycle and attempts both cleanups. Other applications retain
explicit `null`; transitions never restart pressure. The old fixed-condition
helper and its exported contracts are unchanged. The consumer can require this
evidence explicitly while continuing to replay old transcripts without it.

## Implemented peer path and phase observer

`research.physical_challenges.worker.peer_subprocess_proxy(recipe)` selects an
explicit fixture-only peer wrapper. It accepts only the exact dedicated worker
command and the six closed recipe/control names. Ordinary peer wire schemas and
all old fixed-condition selectors remain unchanged. Long start/transition work runs on a single command executor while ordinary
media polling continues. It does not publish an early command acknowledgment or
restart any deadline. The wrapper pins the private
engineering directory, isolated-game capture and actual identity element, and
always attempts condition and media teardown after failure.

`peer.ChallengeEndpoint` consumes sequential commands before executing them, so
a failed command is never executed again. Requests are canonical JSON bounded to
4 KiB; acknowledgments are bounded to 256 KiB and bind the exact request bytes.
Generation, recipe, channel nonce and sequence must agree. There are at most 32
commands; a completed normal sequence contains ten. No arbitrary property setter
or pressure dose is exposed. `channel.OwnedDirectory` pins directory identity,
ownership and private permissions; it uses descriptor-relative bounded reads,
no-follow opens and atomic publication without replacing command/ack files.

`handle.ChallengeHandle` pins the current slot/token and generation, retains raw
request/ack strings and controller-side brackets, and never compares controller
timestamps with worker timestamps. Fresh post-cleanup snapshots recheck owned
absence; a stopped condition is not evidence that the media worker has stopped.

`observer.ChallengeObservation` retains healthy/post references, phase witnesses
and independent cgroup CPU reads. It delegates the original paired cadence/media
checks. Condition transition and establishment finish before cadence readiness;
the real cadence dispatch remains in the original local controller. Source
cleanup and the complete command prefix are retained during checkpoint failures.
It does not export a stable N2 pair for a changing condition.

The core's `inspect_challenge_transcript` checks serialized lifecycle consistency,
including phase timing and cleanup. It always leaves raw-media/dose verification
and N2 admission false. Synthetic private-file round trips and tamper checks are
software evidence only.

## One-shot acquisition and raw custody

From `engine/runtime`, the separate collector is
`scripts/research/n11/acquisition/physicalChallengeObservation.mjs`:

```sh
node scripts/research/n11/acquisition/physicalChallengeObservation.mjs prepare \
  --image "$IMAGE_DIGEST" --acquisition-id "$CASE_ID" \
  --core-revision "$CORE_REVISION" --recipe delay_to_pressure \
  --exclusions /explicit/exclusions.json --output /explicit/plan.json
node scripts/research/n11/acquisition/physicalChallengeObservation.mjs acquire \
  --plan /explicit/plan.json --output-directory /explicit/new-case
```

`prepare` performs no acquisition. It snapshots the canonical no-retry exclusion
receipt and binds source files, producer/core revisions, cached image and native
software identity. `acquire` requires the unchanged canonical plan, allocates one
new directory and one exclusive attempt marker, freezes the source files and
executes exactly one contained capture. It checks the source again afterward.
Previously excluded IDs are rejected. Failed or partial native captures stay on
disk with a failure receipt; an attempt marker is never replaced to retry a case.
A prepared plan is not study approval; use an exact reviewed collection scope.

The native/browser selector now accepts only the six closed
`engineering-n11-physical-challenge-<recipe>` modes. This path requires both
acknowledged receiver delivery and encoded-event diagnostics. It retains the
original encoded-trace reconstruction and unavailable reasons, adapting only the
new healthy/post reference event names. References require actual CPU and native
read spans, using the existing 3.2-second readiness rule, rather than controller
elapsed time alone. All original action, observer, read and watchdog limits stay.

The broader `source_manifest_hash` and the driver's `native_software_hash` use
different inventories. Both are recorded; the latter is computed by the same
function during preparation and native capture and must match the actual result.
Current N11 helper sources are in both custody hashes and native source mounts.
This identifies recorded bytes, not independently authenticated execution.

A case retains `plan.json`, `exclusions.json`, `sources/`, `acquisition.json`,
`command-transcript.json`, `degraded.raw.json`, `relief.raw.json`,
`recovery.raw.json` and `raw-export.json`. Captures are reserialized from the
original acquisition and have separate byte hashes. No `observation.json`,
stable-phase declaration or N2 bundle is emitted. Changing conditions are not
relabeled as stable paired evidence. A late source change can leave an internally
consistent raw export while `failure.json` still makes the overall case failed.

The core's `inspect_challenge_raw_export` accepts the original acquisition, plan,
raw export and exclusion bytes. It verifies these bindings and replays the full
lifecycle transcript. It leaves media, resource-dose, N2 and empirical acceptance
false. Whole-source/media/projection checks and native qualification remain
separate work. Detailed pressure allocation/intent evidence and actual native
media/read semantics must be sufficient for that inspection before a pilot.

The draft engineering pilot and later study remain separate reviewed scopes.
No physical data was collected by the software tests or the raw-custody examples.

See [resource observation](resource-observation.md),
[paired observations](n11-paired-observation.md) and [the N11 index](README.md).
