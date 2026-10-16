# N5 live test procedure

**Coding:** campaign and overhead workflows implemented. **Execution:** real
checks recorded, full N5 acceptance pending. [Export](n5-experiment-export.md),
[original reproduction](n5-experiment-reproduction.md).

The core's `docs/scenarios/N5_RUNTIME_ACCEPTANCE.md` is the current live ledger;
`experiments/n5-runtime-20261013/README.md` records sanitized receipts and replay
commands. Actual Gst/counter compatibility fixes are in producer commits
`eac8e58`, `08a4732` and `ae00593`. Corrected nominal recordings have 900 queue/encode
pairs per phase and zero drops. All five overhead pairs pass, with median CPU
increase 0.37238 percentage points on selected `workload-4` and essentially
unchanged 30 FPS throughput. The earlier lighter-scene result is retained separately.
Tiny-capacity, toggle, interruption/restart and two-peer checks also pass.

Earlier lightweight-scene fault cohorts did not pass. Corrected quota-only cohorts did not consistently
slow the lightweight scene; pinning the whole container to one CPU made its nominal
baseline inadequate. Failed/canceled acquisitions are retained, not combined with
previous successes. The supported browser trace also excludes 681 negative API
lags out of 900 callbacks; the remaining 219 pairs are zero. API absence is tested
by deliberate removal on an actual HTMLVideoElement, not by a natively unsupported
Chromium build. A different callback timestamp needs additive method review.

Prior actual Linux verification passed 79 scenario and 58 trace/control Python
tests with no Linux-only skip. Current macOS readiness checks pass 2,032 core
Python 3.13 tests at 93.55% coverage and 783 Node tests with one existing
external-artifact skip. The prior Python 3.11.17 baseline passed 2,015 tests at
93.61%, 25 schemas and frozen pins; core and Pixelated merged-baseline hosted gates now pass at `3313139` and
`31d675a` respectively. Normal desktop/picker sign-off remains unverified, and
subsequent audit fixes need their normal CI run. The standard
native image builds and passes Gst import plus bounded Frozen Bubble/Neverball
package smoke; actual Node 24.18.1 engine verification passes 135 tests with one
existing external-artifact skip. The research capture image is recorded separately. Full N5 and Phase 1 remain open.

## Choose the execution path

The commands below describe the normal Pixelated desktop route and use container
`pixelated-node`. The observed acceptance run uses an isolated research capture
container, loopback socket relay, deterministic animated X11 scene and a headless
Chromium receiver. Its retained, now stopped container is `n5-acceptance-ae00593-r7`, image
`pixelated-n5-acceptance:ae00593`, and overhead request is `campaign-7`. Use
`docker cp` to inspect retained public evidence; do not restart old inboxes. Start a fresh camera lifetime and
use new campaign/output/volume IDs for a new acquisition. Do not overwrite or
resume the retained failed campaign as if it were a successful cohort.

The recorded macOS captures used
`/Applications/Docker.app/Contents/Resources/bin/docker`; the `/usr/local/bin/docker`
symlink pointed to an absent OrbStack installation. The final 2026-10-16 check
finds the bundled client present but its configured daemon socket unavailable.
Start Docker Desktop and confirm `docker version` reports a server before preflight.
For builds, also put the bundled CLI directory on PATH so its credential helper is
available. A Docker Desktop Linux VM is sufficient for these capture tests.

## Prepare the runtime

1. Install/start Docker Desktop. Its Linux VM can run this engine on macOS; record
   the Docker/VM versions, architecture and allocated CPU/RAM. A separate Linux host
   is optional. Actual pidfd/cgroup/Gst/receiver preflight must still pass.
2. Commit the intended source changes in both trusted checkouts and save exact
   commits. Build the current producer image, rather than using a cached older
   image. For the existing native Linux runtime use:

   ```sh
   npm run build:native -w @pixelated/engine-runtime
   ```

   This invokes Docker only when you run it. The acceptance research image was
   built separately. The standard native image now also builds and passes its
   native-package smoke; a new checkout still needs its own build/identity record.
   Native Linux supports the existing locked runtime/architecture settings. Preserve the image identity and build metadata with the test record.
3. Start the development desktop with an explicit research/workload declaration:

   ```sh
   PIXELATED_N5_RESEARCH=1 PIXELATED_N5_WORKLOAD_ID=workload-1 \
     PIXELATED_N5_WORKLOAD_SEED=7 npm start -w pixelated-desktop
   ```

   The opt-in startup adds the private `pixelated-n5:/n5` volume, trace flags and
   camera control directory `/n5/control`. Normal startup adds none of these. The
   image seeds owned private evidence directories for UID/GID 10001. Evidence goes
   to the volume, not the normal small `/run/pixelated` temporary filesystem.
4. Start the engine/game through Pixelated, connect exactly one local browser
   receiver and keep it draining. Use a known animated nonprivate workload, fixed
   scene/input/seed procedure, Xvfb `:99`, PulseAudio `auto_null.monitor`,
   1280×720/30 fps and VP8. Declare the workload you actually loaded; the harness
   cannot infer scene contents or reseed an arbitrary game. Freeze that procedure
   and save its commands before measurements. The camera launcher observes Node;
   retrieve the actual container version for the plan:

   ```sh
   docker exec pixelated-node node -p process.versions.node
   ```

   Use the returned version below. Declare host worker count within the observed
   allocation; the adapter refuses hidden/unsupported allocation or excess workers.
   An unavailable preflight is a retained failure, not a successful live run.

## Submit the fault campaign

Inside the container, prepare and submit a frozen schedule. Replace the three
uppercase placeholders with the actual checkout commits and observed Node version:

```sh
docker exec pixelated-node python3 -m scenario_harness.campaign_cli prepare \
  --output /n5/control/plan.json --campaign-id campaign-1 \
  --core-version CORE_COMMIT --producer-version PRODUCER_COMMIT \
  --node-version OBSERVED_NODE_VERSION --workload-id workload-1 --seed 7 --workers 1

docker exec pixelated-node python3 -m scenario_harness.campaign_cli submit \
  --directory /n5/control --plan /n5/control/plan.json
```

Default schedule: 18 acquisitions, three reference and three held-out runs for
healthy, host contention and capture pacing. The default order groups three
references per class, then three held-out queries per class (healthy, contention,
pacing in each group); retained `campaign-4` used that order. Retained `campaign-5/6` used prospectively declared interleaving and allocation
changes. The former failed to slow capture and the latter failed baseline adequacy;
both were canceled and retained. The current execution record explains each
configuration. Preserve nominal adequacy when selecting a future workload/allocation. Never infer ordering from run filenames. It takes roughly 42 minutes plus
transition/preflight/export time if all trials execute. The explicit order is saved
in the plan; `--repeats` accepts 1–4, `--workers` 1–8. If you change order or settings,
do it before submission, never after examining effects. Source IDs are assigned
before measurement; each acquisition gets new recording clocks/frames and a
nonoverlapping observed window. Separate source/workload verification is still
required before scientific reference/query acceptance.

The library runs on a dedicated camera control thread, not a frame callback or
GLib event handler. CPU pressure and the 50 ms pacing element are scoped/bounded.
Pacing uses additive experiment-v2 roots; healthy/host retain frozen v1 meanings.
Failed effects stay in the results. Cancellation, unavailable runtime, aborted
runs or failed cleanup stop later acquisitions while retaining the written prefix.
Check state without exposing the private lease/native identity files:

```sh
docker exec pixelated-node cat /n5/control/campaign-1/campaign-index.json
```

To cancel cooperatively:

```sh
docker exec pixelated-node python3 -m scenario_harness.campaign_cli cancel \
  --directory /n5/control
```

When execution ends, copy only the public campaign subdirectory:

```sh
docker cp pixelated-node:/n5/control/campaign-1 /private/tmp/n5-campaign-1
```

From the core checkout:

```sh
.venv/bin/python -m latency_fingerprinting inspect-campaign \
  --directory /private/tmp/n5-campaign-1 --output /private/tmp/n5-campaign-report.json
```

The report verifies frozen declarations/assignments, exact byte/hash receipts and
every retained effect; it reports all outcomes and repeated effect criteria. It
never silently promotes features or claims Phase 1 complete. Hashes and source IDs
alone cannot prove acquisition independence or scientific causality.

## Run the separate overhead request

Stop the workload/camera through Pixelated after copying results. Under a clean
lease only, clear fixed inbox files (acquired evidence is retained):

```sh
docker exec pixelated-node python3 -m scenario_harness.campaign_cli clear-request \
  --directory /n5/control
```

Restart the same workload/camera and reconnect the same single receiver, preserving
scene/settings/VM allocation. One request is accepted per camera lifetime. Prepare
and submit a separate ten-trial engineering plan:

```sh
docker exec pixelated-node python3 -m scenario_harness.campaign_cli prepare --overhead \
  --output /n5/control/overhead-plan.json --campaign-id campaign-2 \
  --core-version CORE_COMMIT --producer-version PRODUCER_COMMIT \
  --node-version OBSERVED_NODE_VERSION --workload-id workload-1 --seed 7

docker exec pixelated-node python3 -m scenario_harness.campaign_cli submit-overhead \
  --directory /n5/control --plan /n5/control/overhead-plan.json
```

The sampler keeps one stable warm pipeline, uses 10 s warm-up/30 s measured windows
and executes disabled/enabled pairs A/B, B/A, A/B, B/A, A/B. Fresh enabled collectors
use sampling 1, bounds 2000/10000 and a 50 ms capture budget. It records raw
camera-process CPU time, wall time, encoded counters, five checksummed traces and
export times. Two separate windows compare ordinary-enabled collection with an
explicit callback-cost diagnostic. Buffer probe durations are bounded to 10,000
samples; actual observed count is retained. No callback performs filesystem I/O.

Copy and inspect after completion:

```sh
docker cp pixelated-node:/n5/control/campaign-2 /private/tmp/n5-overhead
```

```sh
.venv/bin/python -m latency_fingerprinting inspect-overhead \
  --directory /private/tmp/n5-overhead --output /private/tmp/n5-overhead-report.json
```

The checker preserves the predeclared order and all values, independently computes
exact-rational five-pair medians, verifies trace hashes/coverage/drops, diagnostics
and cleanup, and retains failed/unavailable states. Baselines must all reach 27 fps;
median CPU increase must be ≤5 percentage points and FPS change ≥−5%. Enabled
traces need ≥500 queue/encode pairs, ≥95% joint coverage and zero nominal drops.
At least 1000 diagnostic samples and separate process/export measurements are
required. Do not adjust thresholds after seeing results.

## Failure and remaining acceptance

- Do not reuse a campaign ID/output directory or overwrite a prepared plan.
- Dirty restoration refuses submission and `clear-request`. Preserve private
  journal evidence for ownership recovery; do not delete it to claim success.
- A changed/disconnected peer, hidden cgroup/pidfd support, insufficient CPU/FPS,
  missing trace pairs or failed restoration is a recorded failure. Resolve the
  setup and predeclare a fresh campaign, keeping prior results.
- Actual interruption/restart, tiny-capacity, disable/re-enable, two-peer and
  supported/unsupported browser cases remain separate N4 runtime trials. Follow
  the core's `docs/observability/N4_INTEGRATION_VERIFICATION.md` and capability
  criteria, retaining all values and exact commands. Their reports are not inferred
  from the nominal campaign/overhead workflow.
- Minimum-version/container/hosted execution and externally verified source
  separation remain real acceptance evidence. Docker Desktop VM measurements
  describe that allocation/environment; they are not bare-metal performance claims.

## Selected workload after engineering calibration

The subsequent six short trials screen 24/192/512-rectangle deterministic scenes
without claiming acceptance: all short exports remain insufficient_evidence in
the detached inspector. The 512 rectangles of size 32 pixels (`workload-4`, seed 7)
give repeatable 24.6–24.7 degraded FPS with near-30 healthy/recovery and adequate
owned worker CPU. Core `experiments/n5-runtime-20261013/calibration-screen.json`
retains the frozen screen and every result.

Fresh full `campaign-8` uses this scene, the same unpinned one-CPU/one-second quota,
producer `7e78d48`, and a separately labeled image `pixelated-n5-calibration:7e78d48`.
Its eighteen new reference/query assignments and interleaved order are frozen
before measurement. Runtime `n5-acceptance-7e78d48-c8` is separate from retained
failed cohorts. Normal phase durations and acceptance predicates are unchanged;
the full schedule now finishes with 18/18 independently verified acquisitions
and repeated-effect criteria passed. Core publishes the plan/index/report under
`experiments/n5-runtime-20261013/`. Selected-scene overhead (`campaign-9`) also passes all fixed thresholds: five
enabled traces each with 900 joint pairs and zero drops, median CPU +0.37238
percentage points and FPS −0.000517%. Core publishes the separate
`workload-4-overhead-report.json`; earlier lighter-scene evidence is preserved.

The bounded live browser diagnostic on 2026-10-14 records 180 callbacks: 170
negative API deltas/ten zero, but all callback-entry deltas positive (median
0.2 ms). This supported the core's subsequently implemented additive method; the short diagnostic does not
change frozen v1 meanings or close browser acceptance. All owned acquisition and
diagnostic runtimes are stopped. The additive browser execution method now passes local software/live checks
(see core `experiments/n5-browser-execution-20261014/`). Final desktop interaction
and normal CI for subsequent audit fixes remain open; merged-baseline hosted
verification now passes in both repos.

## Final manual desktop and hosted checks

The browser execution method is implemented separately from the frozen v1 API
method. Passing local live validation is recorded in the sibling core's
`experiments/n5-browser-execution-20261014/` and N4/N5 runtime ledgers. Merged-baseline hosted gates now pass; the CI steps below are the procedure
for verifying subsequent audit fixes after merge. The manual steps remain
separate from headless producer capture:

1. Build the web player with `VITE_N4_STAGE_TRACE=1`,
   `VITE_N4_STAGE_TRACE_METHOD=execution-v2`, and
   `VITE_N4_STAGE_TRACE_PRODUCER_VERSION` set to the exact final producer commit.
   Use the normal desktop game picker to launch a game, connect the player and
   confirm normal playback/input. Exercise the normal stop/reconnect route.
2. Use **Finish and export stage trace**. Verify picker/download behavior,
   including cancellation and export retry. Adopt the downloaded archive with
   core `ingest-trace`, then `inspect-trace`. Record the v2 schema/release,
   usable execution pairs, all exclusions/loss, exact build commits and outcome.
   Low evidence or visible failure stays pending; a successful download alone
   does not establish timing acceptance.
3. After committing/pushing both repos, retain the final SHA and Actions URL for
   core **CI** (`quality` and `python-311-compatibility`). The earlier successful
   `bc6f42b` run predates these browser changes and cannot verify the final patch.
4. For Pixelated, use **Hosted API Deploy Gate** with `proof_mode=true`, or its
   pull-request contract jobs, to verify the final hosted web/smoke and API
   checks. For desktop packaging use **Desktop Cross-Platform Release Validation**
   with `release_tag` explicitly blank to validate without creating a release.
   Record actual job results; local tests and configured YAML are separate evidence.

Retain manual outcomes in the core runtime ledger. N5/Phase 1 remain open until
these remaining gates have actual evidence. Commit subjects use `[type] summary`
in Pixelated and `type: summary` in latency_fingerprinting.

## Pre-manual audit, 2026-10-15

The sibling core's [audit record](../../latency_fingerprinting/experiments/phase-1-audit-20261015/README.md)
records successful hosted runs for both exact merged baselines. Local input
hardening now rejects FIFO/special private journals without waiting for a writer;
actual Linux regressions and existing cleanup/ownership tests pass. The remaining
moderate `fast-copy` advisory is fixed within the compatible major version and
all five scopes' full/production npm audits report zero vulnerabilities.
Current audit source changes require their normal hosted run after merge.

Retain a small manual result record with exact build commits, game launch/input,
stop/reconnect, trace export, cancellation/retry and detached v2 inspection
outcomes. A failed or untested step stays pending. These manual outcomes are the
remaining user sign-off before N5/Phase 1 can be closed; a new long fault campaign
is not needed merely to exercise these UI paths.

## Follow-up readiness audit, 2026-10-15

The [follow-up review](../../latency_fingerprinting/experiments/phase-1-readiness-20261015/README.md)
adds cleanup of browser writable streams when saving fails. Successful saves and
picker cancellation keep their existing behavior; failed writes attempt abort
before cancellation/download fallback. Telemetry parsing/CSV serialization and
API database-test helpers are separated by responsibility. Scenario effect,
worker and camera-hook tests are independently discoverable, with their original
test methods retained. These changes do not replace the manual checks above.
Current full-suite counts and verification limits are in the linked record;
earlier native Linux/minimum-version results retain their original versions.


The [script/CI maintenance pass](script-maintenance.md) adds full workspace
regression gating before hosted deployment and hardens utility cleanup/diagnostics.
The [final review](../../latency_fingerprinting/experiments/phase-1-final-check-20261016/README.md)
passes 783 local Node tests with one existing artifact skip. Actual new CI lanes
and the manual outcomes above remain separate acceptance tasks.
