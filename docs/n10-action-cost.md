# Fixed-schedule unchanged/action acquisition

This opt-in owned-game procedure acquires two separate conditions through the
actual camera, authenticated relay, local owner and Chromium receivers. Both
use the same presentation-gated game script and fixed measurement schedule.
Normal production sources reject engineering control configuration and dispatch.

Build the engine, then use an immutable cached native image from the
[browser/native acceptance procedure](n10-browser-native-acceptance.md):

```sh
npm run build:engine
npm run smoke:n10-browser-native -w @pixelated/engine-runtime -- \
  --image "$N10_NATIVE_IMAGE" --mode engineering-game-unchanged-cost-v2
npm run smoke:n10-browser-native -w @pixelated/engine-runtime -- \
  --image "$N10_NATIVE_IMAGE" --mode engineering-game-action-cost-v2
```

Retain each emitted record in a new ignored `local/` file. Assess one record with:

```sh
PYTHONPATH=engine/runtime python3 -m live_probe_control.action_cost_screen \
  "$N10_ACTION_COST_RECEIPT"
```

The v1 method is `n10-contained-game-action-cost-acquisition-v1`, with role
`contained_game_action_cost_not_qualification`. The standard `--mode all` and
previous lifecycle protocols retain their existing meanings. These new records
are operator acquisitions; do not relabel them into an older cohort or offline
evidence root.

## Conditions and timing

Both peers use the balanced 1500 kbps profile, VP8 CPU-used 6, quantizer 48,
640×480 capture and initial 30 FPS. Owned game/native readiness and the first
presented browser frame gate the start of scripted input. Eligibility has an
eight-second deadline and measurement follows a fixed three-second script warmup.

| Script age | Observation or action |
| --- | --- |
| 3 seconds | Baseline native and browser windows start. |
| 6 seconds | Common boundary; unchanged does nothing, action dispatches one idempotent request. |
| 7 seconds (v1), 8 seconds (v2) | During windows start after at least 500 ms of stable observed target cadence. |
| 14 seconds | Restored windows start; action requires a real verified result and fresh 30 FPS snapshots stable for at least 500 ms. |

Native windows cover at least 2.5 seconds; browser windows cover two seconds.
Fixed starts and the boundary allow at most 150 ms lateness. Missing a deadline
fails acquisition; the driver cannot reschedule or warm up again. Independent
browser traces retain transitions between the windows.

The unchanged condition keeps both peers at 30 FPS and creates no controller
request, setter call, journal, reservation, result or restoration claim. The
action condition changes the first peer to 24 FPS for five seconds, keeps the
sibling at 30 FPS and retains one action's full seven-second reservation after
verified restoration. Exact worker and owned-source bindings remain required.
Both conditions perform common readiness and journal-presence observations.

The separately versioned v2 acquisition uses modes
`engineering-game-unchanged-cost-v2` and `engineering-game-action-cost-v2`, method
`n10-contained-game-action-cost-acquisition-v2`. It allows two seconds from the
fixed six-second dispatch boundary to the fixed eight-second during window.
Native worker snapshots arrive every 500 ms; acquisition must observe a fresh
target and at least 500 ms of stability before that window. The original v1
one-second gap can fail this requirement. V2 retains the five-second action,
2.5-second native window, 150 ms lateness limit, restoration checks and seven-second
reservation. Neither version may delay its window adaptively. Old v1 records
retain their outcomes and cannot be relabelled as v2.

## Interpretation and further comparison

The screen checks acquisition consistency, settings, timing, resource-counter
continuity and receiver progress. A `met` screen supplies descriptive costs for
the measured phases. Action-cost budgets, causal effects, identical source
content, perceptual quality, audio and desktop acceptance remain unassessed.
Pulse, lease guard, watchdog child and startup costs remain explicitly unmeasured.
The three point windows do not capture total action or failure cost.

Before a qualification cost cohort, freeze exact source/image/receiver context,
independent repetitions and order, comparability and missingness rules, transition
and failure cost scopes, and reviewed acceptance limits. Preserve every original
attempt and failure, use exclusive outputs and stop if cleanup is unconfirmed.
Matching script age does not establish identical pixels. Do not derive live limits
from development pilot results or treat a later pass as replacing an earlier row.

The [contained lifecycle procedure](n10-contained-game-control.md) and
[failure cohort](n10-contained-game-failures.md) remain separate. Qualification
and producer activation require their own evidence and explicit policy; every
record here retains `live_authority=false`.

## Matched measured-phase cohort

The fixed-order runner creates six independent sessions in this order:
unchanged/action, action/unchanged, unchanged/action. It opens a new output
exclusively, checkpoints every attempt, performs no retries and stops if cleanup
is unconfirmed. Run it only after freezing the exact source and context and the
comparison rules in an ignored local plan:

```sh
node engine/runtime/scripts/n10/actionCostCohort.mjs \
  --image "$N10_NATIVE_IMAGE" --output "$N10_ACTION_COST_COHORT" --protocol v2
PYTHONPATH=engine/runtime python3 -m live_probe_control.action_cost_cohort_v2 \
  "$N10_ACTION_COST_COHORT"
```

`N10_ACTION_COST_COHORT` must be a new absolute filename. Run sessions sequentially
without unrelated benchmarks or builds. The comparison method is
`n10-contained-game-action-cost-comparison-v2` for the v2 schedule. Omitting
`--protocol v2` keeps the v1 runner, assessed with `action_cost_cohort`; versions
cannot mix within one cohort. Its fixed pairs use zero-based
indices `(0,1)`, `(3,2)`, `(4,5)`, always unchanged first in each comparison.
The acquisition order remains unchanged in the report.

All sessions must retain one image/source/browser/host context, distinct owned
capture and worker identities, and nonoverlapping native clock intervals in
acquisition order. These are checks of supplied observations, not execution
authentication. Within each pair, native game/script start and end ages, native
and browser measurement durations, and browser phase progression from the start
of its independent continuous trace must differ by at most 150 ms. Browser and
native clocks remain separate. A matching script phase cannot establish identical
pixels or remove scheduling and workload noise.

Each comparable pair reports signed action-minus-unchanged CPU percentage-point
and sampled peak-RSS byte differences for baseline, during and restored phases.
There is no averaging, subtraction of baseline from later phases, retry selection
or automatic removal of an outlier. Failed acquisitions and incomparable pairs
retain their rows and null deltas with reasons. A measured temporal failure is
reported as `not_met`, distinct from missing or incomparable data (`unavailable`).

A `met` comparison means the acquisition screens and comparability rules met.
It does not mean the measured cost passed an acceptance budget: `cost_limits`
remains unavailable. Total transition/failure cost and the previously listed
unmeasured process scopes also remain unavailable. Define reviewed cost limits
and complete those scopes before qualification acquisition. Old observer budgets
are not silently reused as action-cost limits.

After a verified action result, the acquisition keeps checking receiver/native
continuity while the two-snapshot admission cache returns to baseline. A mixed
old-target/new-baseline cache cannot authorize another action. Strict admission
readiness is required again before the fixed restored window; stale browser or
native observations, lost progress and changed worker identities still fail.
