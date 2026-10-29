# Contained fault and recovery CPU acquisition

This opt-in procedure adds bounded CPU checkpoints to the existing owned-game
cancellation, receiver-observation loss, source-socket identity loss and active
reconnect cases. It uses the same exact-worker lifecycle, verified/unknown
restoration, retained reservation, replacement and issuer-restart rules from the
[contained failure procedure](n10-contained-game-failures.md). Normal production
sources continue to reject engineering control configuration and dispatch.

```sh
npm run build:engine
node engine/runtime/scripts/n10/faultCostCohort.mjs \
  --image "$N10_NATIVE_IMAGE" --output "$N10_FAULT_COST_COHORT"
PYTHONPATH=engine/runtime python3 -m live_probe_control.fault_cost_screen \
  "$N10_FAULT_COST_COHORT"
```

Use the immutable cached image from the [native acceptance procedure](n10-browser-native-acceptance.md).
The output must be a new absolute file in ignored `local/`. Freeze exact source,
image, browser, the four-case order, timing, scope and missingness before collection.
The runner opens outputs exclusively, checkpoints every attempt, makes no retries
and stops if cleanup is unconfirmed. Unknown measurements and failed attempts
remain in their original rows.

Modes are `engineering-game-cancel-cost`, `engineering-game-receiver-loss-cost`,
`engineering-game-source-loss-cost` and `engineering-game-reconnect-cost`, in that
order. Their outer method is `n10-contained-game-fault-cost-v1` and role is
`contained_game_fault_cost_not_qualification`. Original fault records retain their
method and role. Do not relabel cost records into an older cohort or evidence root.

## Intervals and fault semantics

The browser starts its own cumulative CPU observation after both viewers present
frames, then writes a host-only fixture marker. The native fixture checks its exact
method/case/peer list before starting the existing admission and fixed warmup.
An absent marker has an eight-second deadline; it is not a network authorization
message and grants no production capability.

Private-container cgroup CPU is checkpointed immediately before preparing the
request, after injecting the fault, after observing its result and after verifying
replacement/restart behavior. The final cleanup-callback checkpoint supplies a
fourth interval after lifecycle verification. These cumulative counters retain
CPU charged before old workers and ancillary children are reaped. Missing or
replaced counters, reversed clocks, resets or uncertain cleanup remain unavailable.
CPU-seconds and percentages apply only to each stated native interval.

Cancellation still requires an aborted/cancelled result with verified restoration
and a clean retained four-second reservation. Loss/reconnect cases retain unknown
restoration or an explicitly unavailable result, dirty state, the full reservation,
exact old-worker teardown and dirty-state blocking after restart. Cost recording
cannot turn process death into restoration proof. The sibling must retain its
identity and progress, and its two-second receiver screen remains required.

Browser CPU uses its independent host clock from presentation gating through
lifecycle completion detection. It is not aligned with native checkpoints and
does not include the browser's eventual exit. Its process inventory must stay
stable. Container CPU includes overlapping per-process work and must not be
added to browser or native process CPU to claim a synchronized total.

The cost screen reuses lifecycle assertions and requires the three retained
lifetime checkpoints, but does not independently reconstruct all hashed
lifetime/journal comparisons. Keep those original observations and their separate
verification. Every screen retains `live_authority=false`.

## Qualification boundary

These four engineering cases provide descriptive cost observations, not matched
fault-effect estimates or approved live limits. Initial source startup, later
relay/interpreter/container/browser exit, individual ancillary-process cost
breakdowns and browser RSS/GPU remain excluded. Parent-death/watchdog-specific
cost cases are not established by these four modes.

Before qualification acquisition, define the supported context, required fault
matrix and numerical cost limits with units and intervals. Review those limits
independently of development receipts; old observer budgets do not become fault
or action limits automatically. Define permitted visual/cadence loss, audio
continuity and supported desktop workflows separately. Bind accepted evidence and
limits to an explicit policy revision before supported producer activation.
A missing decision or acceptance keeps qualification unavailable.
