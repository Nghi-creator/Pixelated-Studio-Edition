# Fixed pacing contrast fixture

`prepare-pacing-contrast` is a separate default-off engineering protocol. It fixes
identity sleep-time to 37,500 us while the existing cadence action uses 30→24→30
FPS. The original `prepare-pacing` protocol still fixes 50,000 us under its own
method and receipt checks. Neither protocol accepts an arbitrary delay or grants
production dispatch authority.

The new delay is the midpoint between the two cadence periods. Its modeled serial
ceiling is 80/3 FPS, between 24 and 30. The old 50,000 us ceiling is 20 FPS, below
both settings. Native overhead can erase the modeled crossing. Preparation is not
proof of measured contrast, diagnosis or useful corrective action.

```sh
npm run build:engine
node --experimental-strip-types engine/runtime/scripts/research/n11/pairedObservation.mjs prepare-pacing-contrast \
  --image sha256:<cached-native-image-id> \
  --acquisition-id n11-raw-contrast-example \
  --core-revision <full-current-core-revision> \
  --output /absolute/private/contrast-plan.json
node --experimental-strip-types engine/runtime/scripts/research/n11/pairedObservation.mjs acquire \
  --plan /absolute/private/contrast-plan.json \
  --output-directory /absolute/private/contrast-example
```

The source-bound plan uses `n11-contained-pacing-contrast-plan-v1`, mode
`engineering-n11-pacing-contrast` and owned property method
`n11-owned-pacing-contrast-v1`. It freezes the delay, image, source bytes, four
browser rows per phase, one five-second action, restoration grace and existing
fault/container/outer deadlines. Preparation/output are exclusive and the attempt
lease prevents re-execution. Mixed variants, changed source or foreign properties
fail. Keep every failed prefix and stop according to the prespecified protocol.

Ownership, fresh property sequences across all three whole phases, independent
20 s timer, observed same-generation removal, native references and teardown
follow the [owned pacing procedure](n11-pacing-feasibility.md). Native rollback
keeps its original settings/generation/leases/fresh-progress proof; removal of the
fault and later throughput recovery remain separate observations.

The receipt preserves the original healthy-reference, initial-degradation and
post-fault recovery indicators, then additionally reports initial native FPS>24
and relief native FPS<initial. Complete absent indicators are `unmet`; malformed,
missing or unknown ownership/cleanup evidence fails. Keep actual rates and original
counters/times. An independent core adopter must also check complete N3 encoder
primaries: initial>24 and relief<initial. The producer cannot assert that later
core check; it explicitly records it as required/unavailable.

Contrast exports carry a separate compatibility group and acquisition marker,
including the fixed planned pacing/cadence recipe. This names the common study
protocol, not the active cause or a truth label. Future healthy/other-cause arms
need the same prospectively declared protocol context; their actual fault state
belongs in independent raw receipts. Source-local method 1.2.0 remains
unchanged. Old/new intensities must not be pooled as one profile context, even
when executed from the same source build. Their phases remain one connected
source group per acquisition.

A positive model or short measured contrast is not statistical separation,
independent cause/healthy truth, N6 group acceptance, diagnostic utility or final
study acceptance. A separately versioned median-response experiment is also an
explicit engineering analysis; it cannot confer labels or override original N7.
Do not tune delays, thresholds or repetitions until a desired result appears.
