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

No new challenge launcher or acquisition command is enabled by this document.

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

## Required implementation

Integrate these primitives into a separately named peer/native mode and source
declaration, joint-condition observer and strict source receipts. Persist
old/new state brackets and fresh readback; establish each new
condition for one second before its measurement. Pressure stop must prove reaping;
delay stop must prove the zero postimage. Retain healthy and post references,
media/receiver delivery checks, CPU and encoded read brackets, and complete
restoration even after partial transition failure. Never reset a real condition
lifetime or watchdog by replacing a state object.

Condition switching and establishment must finish before cadence dispatch. The
current relief-start gate allows 1.75 seconds after dispatch; adding a one-second
condition establishment inside an already started action can break that bound.
Keep the 100 ms cadence-settling clock anchored at the actual setter attempt.

Keep the existing 20-second active-condition limit, 40-second child failsafe,
5-second cadence action, 4.5-second phase bound and existing setter/read budgets.
Transition work must fit within them. Qualify timing and concurrent resource
indicators on the real fixture before proposing a challenge cohort.

Changing recipes must not claim stable paired observations. Exports/receipts need
to retain the change and allow the consumer to distinguish a failed source,
unsupported projection and computed abstention. A stable mixed recipe must not
be relabeled as either single owned condition. No challenge labels may leak into
numerical scoring inputs. The new source needs matched controls and calibration;
the old rx1 fit cannot silently accept its new source/runtime identity.

See [resource observation](resource-observation.md),
[paired observations](n11-paired-observation.md) and [the N11 index](README.md).
