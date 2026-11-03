# Owned pacing engineering fixture

This default-off fixture adds a fixed 50,000 microsecond delay to the owned
native worker's existing `captured` identity element. The independent cadence
probe still writes only `source_rate` caps 30→24→30. Production worker code,
private IPC operations and normal startup remain unchanged: only the disposable
fixture's exact worker launcher installs the local pacing helper.

```sh
npm run build:engine
node --experimental-strip-types engine/runtime/scripts/research/n11/pairedObservation.mjs prepare-pacing \
  --image sha256:<cached-native-image-id> \
  --acquisition-id n11-raw-pacing-example \
  --core-revision <full-current-core-revision> \
  --output /absolute/private/pacing-plan.json
node --experimental-strip-types engine/runtime/scripts/research/n11/pairedObservation.mjs acquire \
  --plan /absolute/private/pacing-plan.json \
  --output-directory /absolute/private/pacing-example
```

The frozen plan fixes the owned isolated-game source/image, same container bounds,
one receiver, four browser rows/phase, one five-second cadence action and existing
restoration grace. Preparation/output refuse overwrite; the attempt lease prevents
re-execution. No rate/delay/intensity search or retry-until-effect is permitted.

The helper requires exact engineering capture ownership and owner directory,
idle identity preimage (sleep 0, no sync/drop), current worker generation, and
same element/pipeline throughout. It applies sleep 50,000 once with an independent
20-second timer, refuses foreign settings and restores only the same owned element.
Private atomic generation-bound markers request start/stop, with sequenced actual
property observations every 100 ms outside media callbacks. Full phase boundaries
require fresh observations and preserve parent read brackets and worker clock
provenance separately. No worker/browser clock subtraction establishes latency.

Native references of at least two seconds bracket fault activation/removal. The
fault is established before initial measurement and remains active through both
comparison windows and cadence recovery. Existing relief-start/action deadlines
remain hard; sampling cannot extend them. Property cleanup occurs afterward and
must be observed on the same generation before the final reference. Source loss,
foreign property, stale observation, timer expiry and unknown cleanup fail.
Worker loss retains the failure prefix and any fixture poll failure detail in the
private receipt. Cleanup before activation refuses an unowned delay.
Repeated close is idempotent; pipeline teardown is attempted even if observation
publication fails. Dirty/unknown rollback is retained, never relabelled restored.

The native cadence port verifies same settings/generation, restored configured and
negotiated cadence, healthy leases and fresh native/receiver progress. It does not
require measured throughput to equal 30 FPS. Therefore verified cadence restoration
can coexist with a held pacing fault and slower actual media. Preserve that exact
proof; do not conflate it with different isolated-worker trial criteria. Throughput
recovery after fault removal is attributed to fault removal, not probe utility.

`control-receipt.json` checks actual pacing property across all three phases,
pre-reference>=27 FPS, initial throughput<=95% of reference and post-fault
throughput>=95% of reference. These are separately declared short engineering
indicators, not N5's long-run effect contract, an authenticated cause/healthy
label or scientific acceptance. A complete observation with absent indicators
is `unmet`; malformed/missing evidence is unavailable. Every failed prefix remains.

All raw phases use existing source-local 1.2 adoption, hash-bound original phase/
whole native evidence and unchanged N2/N3 semantics. One acquisition's phases form
one connected source group. Independent labels/group review and real N7 support/
positive dispersion remain required; do not manufacture variation or relax gates.

```sh
node --experimental-strip-types --test engine/runtime/scripts/research/n10/pacingReceipt.test.mjs
cd engine/runtime
python3 -m unittest discover -s tests/python/qualification/observation -t tests/python -p test_pacing_fixture.py -v
```

Full engine/Linux-native and existing production-admission/no-fault checks are
required when changing the shared harness. The installed native image/browser and
all source bytes must match the allocated plan. Final-study counts, held-out data,
passive timing, production activation and Phase 2 acceptance are separate gates.
