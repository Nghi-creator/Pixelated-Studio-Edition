# N5 live test procedure

Run opt-in scenario and overhead measurements through the Pixelated desktop and
Linux container runtime. See [export](n5-experiment-export.md),
[reproduction](n5-experiment-reproduction.md) and [supported adapters](n5-adapters.md).
Confirm `docker version` reports a server before preflight.

## Prepare the runtime

1. Install/start Docker Desktop. Its Linux VM can run this engine on macOS; record
   the Docker/VM versions, architecture and allocated CPU/RAM. A separate Linux host
   is optional. Actual pidfd/cgroup/Gst/receiver preflight must still pass.
2. Record the exact source versions and any local changes in both trusted checkouts. Build the current producer image, rather than using a cached older
   image. For the existing native Linux runtime use:

   ```sh
   npm run build:native -w @pixelated/engine-runtime
   ```

   Preserve the image identity and build metadata. Native Linux supports the existing locked runtime/architecture settings. Preserve the image identity and build metadata with the test record.
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

The default schedule contains 18 acquisitions: three reference and three held-out
runs each for healthy, host contention and capture pacing. References are grouped
by class, followed by held-out queries grouped by class. It takes roughly 42 minutes
plus transition/preflight/export time. The explicit order is saved in the plan;
`--repeats` accepts 1–4 and `--workers` 1–8. Freeze order and settings before
submission. Preserve nominal adequacy when choosing the workload/allocation.
Each acquisition gets fresh recording clocks/frames and a nonoverlapping observed
window. Source IDs alone do not prove acquisition independence.

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

## Failures and recovery

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

## Desktop integration checks

1. Build the web player with `VITE_N4_STAGE_TRACE=1`,
   `VITE_N4_STAGE_TRACE_METHOD=execution-v2` and
   `VITE_N4_STAGE_TRACE_PRODUCER_VERSION` set to the producer commit.
2. Launch a game from the normal desktop picker. Check playback, input, stop and
   reconnect with the browser player.
3. Use **Finish and export stage trace**. Check download/picker behavior, cancellation
   and export retry. Adopt with core `ingest-trace`, then run `inspect-trace`.
4. Record the schema/method release, usable execution pairs, all exclusions and
   losses, source versions and outcomes. A download alone does not verify timing.
