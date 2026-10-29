# Owned-game full-span cost acquisition

This opt-in engineering acquisition extends the fixed v2 game schedule with
continuous native cost checkpoints from the baseline start through the restored
window's end. It captures dispatch, settling, the active action, restoration and
the gaps between phase windows. Native CPU ticks and sampled peak RSS cover the
camera parent, relay, game, owned Pulse process and both exact worker children.
Browser cumulative CPU observations use a separate host clock and stable process
inventory; they are not aligned with native timestamps or added to native CPU.

```sh
npm run build:engine
npm run smoke:n10-browser-native -w @pixelated/engine-runtime -- \
  --image "$N10_NATIVE_IMAGE" --mode engineering-game-unchanged-span
npm run smoke:n10-browser-native -w @pixelated/engine-runtime -- \
  --image "$N10_NATIVE_IMAGE" --mode engineering-game-action-span
```

Use the immutable cached image and ownership requirements from the
[native acceptance procedure](n10-browser-native-acceptance.md). Freeze exact
source, image, browser, order, timing, missingness and expected outcomes before
collection. Retain each original attempt in a new ignored `local/` file. The
acquisition method is `n10-contained-game-action-cost-acquisition-v3`; the cadence
schedule remains fixed at baseline3s, boundary6s, during8s and restored14s. V1/v2
records and the prior [measured-phase comparison](n10-action-cost.md) keep their
roles. No normal production source permits this engineering dispatch.

Assess a single passed record or a failed record retained by `nativeCohort.mjs`:

```sh
PYTHONPATH=engine/runtime python3 -m live_probe_control.action_span_screen \
  "$N10_COST_SPAN_RECEIPT"
```

The native recorder emits checkpoints at roughly250ms intervals, with a maximum
of96. CPU is the cumulative tick difference divided by the recorded tick rate;
RSS is the maximum sampled resident size, not an allocation or instantaneous peak
measurement. An exited or replaced owned process remains unavailable; it is never
zero-filled. Missing checkpoints, counter resets, coverage gaps and a changed
browser process inventory leave the cost screen unavailable. Hashes and named
owned scopes do not by themselves authenticate execution.

## Failure prefixes and excluded work

`engineering-game-action-span-failure` deliberately raises a fixture error at
script9.5s. It tests preservation of native checkpoints and browser CPU observations
on an unsuccessful acquisition. The attempt remains failed and cannot replace a
successful action row. A valid retained prefix is labelled `partial_failure_prefix`;
it never becomes a complete action, restoration or cleanup cost. An abrupt kill
without terminal observations leaves costs unavailable while preserving raw
checkpoints. This injected fixture error does not qualify source-loss, receiver-loss
or watchdog fault behavior.

Pulse is included in the native full span. Lease-guard and watchdog-child costs,
startup/warmup, teardown, browser RSS and GPU costs remain explicitly excluded.
In particular, failed-prefix records do not include complete cancellation or
teardown cost. Browser and native spans have independent durations and cannot
be presented as a synchronized total. Record those limits when reporting costs.

A `met` screen establishes complete observations for these declared spans and the
existing phase acquisition checks. It does not approve a cost budget, establish
causal benefit, qualify perceptual/audio/desktop behavior or grant live authority.
A full-span matched cohort, required fault/cleanup costs and reviewed limits are
separate requirements before qualification. Every result here retains
`live_authority=false`.

## Matched full-span comparison and cleanup CPU boundary

Acquire six fresh sessions with a new absolute output path:

```sh
node engine/runtime/scripts/n10/actionCostCohort.mjs \
  --image "$N10_NATIVE_IMAGE" --output "$N10_FULL_SPAN_COHORT" --protocol v3
PYTHONPATH=engine/runtime python3 -m live_probe_control.full_span_cohort_v2 \
  "$N10_FULL_SPAN_COHORT"
```

The fixed order is unchanged/action, action/unchanged, unchanged/action; pairs
remain `(0,1)`, `(3,2)`, `(4,5)` with action-minus-unchanged deltas. Before collection,
freeze exact context, all original rows, comparability and missingness. The screen
retains the existing phase/context/independence rules and requires full-span
native, browser and fixed action-container durations within150ms in each pair. It reports
CPU-seconds, CPU percentage-point and sampled RSS-byte differences separately.
No averaging, retries, outlier selection or cross-clock sum is performed. Missing
or incomparable measurements leave the affected pair's deltas null.

Span modes also checkpoint the disposable container's cumulative cgroup-v2 CPU
at camera readiness and after its cleanup callbacks. This aggregate includes CPU
already charged to exited/reaped container tasks, including ancillary children;
it does not provide their individual breakdown. Counter lifetime replacement,
resets, unavailable reads or uncertain scene/Pulse/worker cleanup leave the
container CPU screen unavailable. The browser failure path waits up to four
seconds for native terminal output before removing its owned container.

This is a separate interval from the baseline-to-restored process span. It
includes readiness/warmup after camera readiness and the cleanup callbacks, but
excludes initial source startup and later relay/interpreter/container/browser exit.
Container CPU overlaps the process CPU observations and must not be added to them.
It supplies bounded cleanup-tail CPU for an intentional failed attempt when its
terminal checkpoint and cleanup flags are present; it does not make the earlier
failed native prefix complete or qualify source/receiver/watchdog fault cases.
No per-process teardown RSS, browser RSS/GPU, causal benefit or reviewed cost
limit is established by a met comparison.

The fixed action-container interval has separate cgroup CPU checkpoints at the
baseline and restored-span boundaries, within50ms of the corresponding native
reads. `full_span_cohort_v2` uses method
`n10-owned-game-full-span-comparison-v2` and compares that interval. Broader
camera-ready-through-cleanup CPU remains a separate descriptive observation;
its setup and cleanup durations are not fixed to script phase. It cannot replace
the action interval or be presented as a matched cleanup effect. The older
`full_span_cohort` method retains its stricter comparison of those broader
intervals; old records and unavailable comparisons are preserved under that method.
New comparisons reject records missing the fixed action checkpoints.

The separate [actual fault-cost procedure](n10-fault-cost.md) records cancellation,
receiver/source loss and reconnect recovery through bounded cleanup callbacks,
while retaining their original lifecycle rules and uncertainty semantics.
