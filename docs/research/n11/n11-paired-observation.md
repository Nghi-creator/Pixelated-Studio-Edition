# Contained paired observation collector

This explicit engineering mode records one owned Frozen-Bubble/Linux receiver at
30 FPS, applies the existing bounded 24 FPS cadence controller once for five
seconds, waits for its verified restoration and records recovery at 30 FPS.
It injects no fault and supplies no diagnostic label, independent training group,
quality qualification or production authority. `degraded` and `relief` name N2
comparison roles; they do not establish an actual degraded cause.

## Prepare and execute

Use a locally cached immutable native-image ID, current core revision and a fresh
private evidence path. Build the engine before preparing; subsequent source edits
invalidate the plan. The plan freezes all runtime/export/browser source bytes,
image, source revisions, one attempt, four browser rows per phase and one action.
No image/browser download or image rebuild is performed by this command.

```sh
npm run build:engine
node --experimental-strip-types engine/runtime/scripts/research/n11/pairedObservation.mjs prepare \
  --image sha256:<cached-native-image-id> \
  --acquisition-id n11-raw-paired-example \
  --core-revision <full-current-core-revision> \
  --output /absolute/private/paired-plan.json
node --experimental-strip-types engine/runtime/scripts/research/n11/pairedObservation.mjs acquire \
  --plan /absolute/private/paired-plan.json \
  --output-directory /absolute/private/paired-example
```

Preparation and outputs refuse overwrite. The exclusive attempt lease prevents
executing a plan again at another output path. Retain failures, source snapshots
and partial prefixes; a software repair requires a new plan and acquisition ID.
Do not retry until a feature or desired effect appears. A changed fault, rate,
duration, schedule or role requires a separately reviewed acquisition contract.

## Observation and control boundaries

The fixture uses the explicit owned `isolated_game` EngineeringControl, exact
scene/capture/worker binding, normal authenticated relay, camera callbacks and
controller/watchdog/journal. Production-source dispatch remains rejected and N5
fixed-setting behavior is unchanged. One ephemeral receiver and loopback signaling
run within the existing container/browser resource and time bounds. No new network
control endpoint exists: the browser reads only token-protected raw telemetry.
Phase/priming acknowledgements are exclusive owned host files on a read-only
container mount.

Before each phase, the native worker must independently report fresh configured
and negotiated target cadence. The page retains telemetry waiting/priming polls,
primes its parser outside the measured phase, while native observations retain
the target for at least 500 ms. Parser priming, engine-cache readiness and native
settling overlap; no extra serial delay is added after cache readiness. Each phase retains four original browser rows at nominal
one-second cadence and the actual engine snapshots, without interpolation or
metric-specific cropping. Native source identity and target remain checked at
every tick. The whole phase takes at least three seconds and must complete within
4.5 seconds in the native bracket. Its exported browser span remains bounded to
1–4 seconds by the phase-export contract.

The native dispatch timestamp is taken immediately before the dispatch call,
so its elapsed bound conservatively includes dispatch overhead. Relief must start
within 1.75 seconds of dispatch and finish strictly before the
five-second action boundary while the operation remains active. This preserves
the controller's hard ceiling; no reservation is extended to fit late collection.
A failed clock/readiness/identity/phase check stops and retains the prefix.
Browser UTC-derived times are never subtracted from native monotonic times to
claim synchronization or detection latency. Native markers bracket the host
collection call without assigning cross-clock latency authority.

Recovery begins only after the actual result reports `completed`,
`verified_by_port`, clean journal, one action and the full five-second plus
existing two-second restoration-grace reservation. A fresh restored observation
and the same parser/settling checks precede recovery sampling. Owned teardown is
required separately and never relabelled as verified live restoration. A terminal
journal checkpoint retains state, reservation, content hash and result facts,
including unknown/dirty failure state when available; private process IDs are
excluded from emitted journal facts and phase bundles.

## Outputs and interpretation

The allocated directory retains `plan.json`, exact `sources/`, the whole original
`acquisition.json`, inspected `control-receipt.json`, and per-phase directories
with original phase `acquisition.json`, `bundle.tar`, `context.json` and `export.json`.
Each phase acquisition references the hash of the whole native receipt and retains
its priming record. Its raw declaration hashes its exact saved phase acquisition
bytes. Failed execution retains `failure.json` and every available prefix. Phase
export failures do not erase already captured native evidence.

Use core `ingest-pixelated-source-local` with the shared comparison case and
respective phase (`degraded`, `relief`, `recovery`). All three phases belong to one
connected acquisition group. Core N2 must independently check context, effective
settings, durations and the actual separately recorded intervention outcome before
forming a pair; exporting recovery alone cannot create that outcome. N3 gates and
missingness remain unchanged. No controlled cause, external healthy confirmation,
N7 support/dispersion, held-out accuracy or final-study acceptance follows from
an engineering control integration.

## Checks

```sh
npm test -w @pixelated/engine-runtime
npm run lint:engine
node --experimental-strip-types --test engine/runtime/scripts/research/n10/pairedObservation*.test.mjs
```

Native ownership/media regressions and existing production-admission/two-viewer
modes should be rechecked when changing the common acceptance harness. Preserve
all source/image-bound receipts privately; this guide records reusable operation,
not qualification of a particular run or source revision.
