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
  --image "$N10_NATIVE_IMAGE" --mode engineering-game-unchanged-cost
npm run smoke:n10-browser-native -w @pixelated/engine-runtime -- \
  --image "$N10_NATIVE_IMAGE" --mode engineering-game-action-cost
```

Retain each emitted record in a new ignored `local/` file. Assess one record with:

```sh
PYTHONPATH=engine/runtime python3 -m live_probe_control.action_cost_screen \
  "$N10_ACTION_COST_RECEIPT"
```

The method is `n10-contained-game-action-cost-acquisition-v1`, with role
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
| 7 seconds | During windows start after at least 500 ms of stable observed target cadence. |
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

## Interpretation and further comparison

The screen checks acquisition consistency, settings, timing, resource-counter
continuity and receiver progress. A `met` screen supplies descriptive costs for
the measured phases. Action-cost budgets, causal effects, identical source
content, perceptual quality, audio and desktop acceptance remain unassessed.
Pulse, lease guard, watchdog child and startup costs remain explicitly unmeasured.
The three point windows do not capture total action or failure cost.

Before a matched cost cohort, freeze exact source/image/receiver context,
independent repetitions and order, comparability and missingness rules, transition
and failure cost scopes, and reviewed acceptance limits. Preserve every original
attempt and failure, use exclusive outputs and stop if cleanup is unconfirmed.
Matching script age does not establish identical pixels. Do not derive live limits
from development pilot results or treat a later pass as replacing an earlier row.

The [contained lifecycle procedure](n10-contained-game-control.md) and
[failure cohort](n10-contained-game-failures.md) remain separate. Qualification
and producer activation require their own evidence and explicit policy; every
record here retains `live_authority=false`.
