# Contained raw-observation collector

The explicit `n11-raw-observation` mode records one unchanged, seeded Frozen-Bubble
Linux fixture through the normal camera/native-worker acceptance path and a fresh
Chromium receiver. It adds no control endpoint, fault, cadence request or paired
response. Production startup and the existing acceptance default modes are unchanged.

Use installed workspace dependencies, a built engine, Playwright Chromium and an
immutable locally cached native image. The image must contain the locked game,
Node, Python/GI, GStreamer, PulseAudio and Xvfb. The collector downloads neither
an image nor a browser.

From the producer root, prepare a fresh private plan and output location:

```sh
npm run build:engine
mkdir -p -m 700 local/phase_2/n11-raw
CORE_REVISION="$(git -C ../latency_fingerprinting rev-parse HEAD)"
node --experimental-strip-types engine/runtime/scripts/research/n11/rawObservation.mjs prepare \
  --image "$N11_IMAGE_SHA" --acquisition-id n11-raw-engineering-001 \
  --core-revision "$CORE_REVISION" --output local/phase_2/n11-raw/plan-001.json
node --experimental-strip-types engine/runtime/scripts/research/n11/rawObservation.mjs acquire \
  --plan local/phase_2/n11-raw/plan-001.json \
  --output-directory local/phase_2/n11-raw/observation-001
```

`N11_IMAGE_SHA` must be an exact `sha256:` ID already available locally. Acquisition
IDs use `n11-raw-` followed by 1–40 lowercase letters, digits or hyphens. Plans and
output directories are created exclusively. Each plan has one observation, eight
browser samples with one-second waits, no label and no retry. The attempt receipt
is created exclusively beside the plan using its acquisition ID; copying plans
elsewhere does not create scientifically independent acquisitions.

The canonical plan binds the declared core/producer revisions and exact runtime,
built engine, collector and web-source hashes. Source changes refuse execution;
actual source bytes are copied under `sources/` before launch and hashes checked
again after export. A base revision does not replace these byte receipts. Retain
failed plans/directories and their prefixes. A repaired collector gets a new plan;
never replace a failed observation or treat selected successful repairs as a final
cohort. A `failure.json` makes the whole attempt failed, even if some artifacts exist.

## Sampling and ownership

The contained fixture owns one viewer, its Node relay, parent camera, seeded game,
display, Pulse monitor and encoder worker. The Node relay has the fixture's engine
role; its CPU is not a measurement of an ordinary deployed engine. Original Linux
process generations are pinned. Changed/exited Node/game/camera generations make
reads unavailable; the parent also checks the selected peer lifetime. Encoder
samples use the existing camera telemetry bridge for that single worker. No worker
CPU is relabelled as parent-camera CPU.

A token-protected GET route exists only in the disposable relay's explicit raw
mode. Readers do not advance CPU counters: the existing engine-owned interval
sampler runs independently. Missing, initial, stale, reset and unsupported values
remain unavailable. Private process IDs and telemetry paths are consumed inside
the container, removed from emitted events and excluded from bundles.

The owned page uses the real WebRTC parser and CSV-sample builder. Engine responses
retain their original capture times/sequences. Repeated cached sequences add no
rows; HTTP status, request/response brackets and excluded samples remain in the
acquisition. The page retains its partial prefix on failure. Sampling runs outside
media callbacks and has no action journal or setter.

Browser and engine UTC times supply wall-derived elapsed axes. They are not
verified clock alignment or cross-clock latency. Engine observations outside the
browser recording interval remain in the acquisition and exclusion receipt but
are omitted from the bounded v2 window. No timestamp rebasing, interpolation,
extrapolation or zero filling repairs partial coverage. Independently timed sources
can therefore have incomplete metric coverage under the frozen N1/N3 gates.

## Outputs and interpretation

A completed observation retains `plan.json`, exact `sources/`, `acquisition.json`,
`bundle.tar`, `context.json` and `export.json`. Failed execution retains the plan,
source snapshot, available acquisition prefix and `failure.json`. Container/browser
cleanup failures fail the attempt. Existing resource limits, loopback-only signaling,
blocked external browser requests, exact container removal and native cleanup apply.

The v2 bundle uses the real CSV/event/summary/support/manifest/TAR exporters. Its
phase is `healthy` for a baseline observation, not an authenticated healthy cause
label. Metadata distinguishes the contained fixture and its image/source manifest.
The core can inspect the unchanged adopter semantics:

```sh
cd ../latency_fingerprinting
.venv/bin/python -m latency_fingerprinting ingest-pixelated-v2 \
  ../Pixelated-Studio-Edition/local/phase_2/n11-raw/observation-001/bundle.tar \
  --context ../Pixelated-Studio-Edition/local/phase_2/n11-raw/observation-001/context.json \
  --phase baseline --comparison-case-id n11-raw-engineering-001 > /tmp/n11-window.json
```

A valid window can contain incomplete/unavailable measurements. One observation
establishes neither a paired intervention, ≥17 active profile features, independent
training groups, fault labels nor empirical acceptance. Existing N7 zero-dispersion
and support gates remain unchanged; audio/perceptual fidelity, diagnosis and live
authority are unavailable.

## Regression checks

```sh
npm test -w @pixelated/engine-runtime
npm run lint:engine
node --test engine/runtime/scripts/research/n10/rawObservation*.test.mjs
```

Relevant Linux native ownership/media tests and the existing two-viewer observer
mode must also pass when modifying collection or cleanup. Keep native receipts
private; they describe their exact source/image rather than granting production
qualification.

## Explicit source-local phase export

To prepare the separately approved source-local temporal contract, substitute
`prepare-source-local` for `prepare`. The arguments and one-shot execution procedure
are the same. It emits `n11-contained-source-local-plan-v1` with
`temporal_contract = source_local_stable_phase_v1`; normal `prepare` retains its
common-window plan and outputs.

The new export records an operator-declared `sourceLocalPhase` in the raw manifest,
exact full-phase bounds and the SHA-256 of the retained original acquisition JSON.
Its context declares `versions.pixelatedTemporalContract`. This binds the unchanged
observations to phase evidence without authenticating cause truth. Sampling,
process identities, original UTC timestamps and cleanup behavior remain unchanged.
Retain the original acquisition bytes and all source/plan receipts.

Use core `ingest-pixelated-source-local --bundle ... --context ... --phase baseline
--comparison-case-id ... --output ...` to rebuild each source on its own actual
recorded span under method 1.2.0. All metrics of one source share that span, including
missing values. Missing/one-point sources stay missing. The root phase, declaration
and each positive source span must satisfy the explicit bounds/duration contract.
Source-local completeness describes a stable phase; it does not establish identical
cross-channel intervals, source-clock synchronization or passive timing authority.
Core's existing N9 path rejects this method. Paired intervention/labels and final
study targets remain separate requirements.
