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

## Stopped media worker

A separate case stops only the exact dedicated media worker after its actual
24 FPS target is observed. The camera, game/display and sibling are not stop
or kill targets. It uses the existing pidfd-bound supervision, lease guard and
controller watchdog paths without disabling them or extending their deadlines.

```sh
npm run smoke:n10-browser-native -w @pixelated/engine-runtime -- \
  --image "$N10_NATIVE_IMAGE" --mode engineering-game-worker-stall-cost
```

The four-case runner above retains its original order and does not include this
case. For checkpointed acquisition, use `acquireNativeCohort` with this one explicit
mode and a new absolute output file; inspect its one-record array with:

```sh
PYTHONPATH=engine/runtime python3 -m live_probe_control.stalled_worker_cost_screen \
  "$N10_STALLED_WORKER_COST"
```

Its method is `n10-contained-stalled-worker-cost-v1` and role is
`contained_game_stalled_worker_cost_not_qualification`. A stopped worker must
produce no fabricated controller result: operation status is `worker_lost`, the
old exact child exits via SIGKILL and is reaped, and its journal remains `active`
with one full four-second reservation. This is unresolved durable intent, not a
clean reservation or verified restoration. Replacement and issuer restart must
preserve the journal and block a new action. The sibling, owned source and camera
must retain their lifetimes and progress. Hashed lifetime/journal consistency is
checked under this separate method; older four-case roots cannot accept it.

The same container CPU checkpoints and independent browser CPU span apply.
A met screen does not attribute the teardown to a particular watchdog, lease
guard or supervisor: their protections can race. Native helper tests separately
exercise guard EOF, stalled heartbeat and watchdog behavior. This is a stopped
media-worker case, not whole-camera death, controller-thread-only failure, full
platform coverage or a qualified live family. The existing cost/quality limits
and later exit/GPU/RSS exclusions remain explicit.

The [qualification protocol checker](n10-qualification-protocol.md) makes pending
scope, limit, quality and exclusion decisions explicit. Filling its declarations
never approves these engineering cost observations or enables dispatch.

## Controller-thread regression

The opt-in Linux regression `test_controller_thread_fault_native.py` exercises
the real cadence controller and pidfd watchdog with a disposable synthetic
GStreamer stream. After observing the actual 30→24 FPS caps change, it either
terminates only the controller thread with `SystemExit` or blocks that thread.
The main loop and native media threads continue running. The test requires
continued 24 FPS negotiation and advancing buffer counts after the thread fault,
followed by SIGKILL teardown of the dedicated worker at its watchdog deadline.
Reopening the actual journal must retain unresolved intent and the full
reservation, with new dispatch blocked until explicit teardown recovery.

Run inside the Linux native test environment with GStreamer and pidfd support:

```sh
N10_NATIVE_PEER_TESTS=1 PYTHONPATH=engine/runtime python3 -m unittest discover \
  -s engine/runtime/tests/python -p test_controller_thread_fault_native.py -v
```

This regression uses a 64×48 synthetic stream and a one-second request with a
three-second reservation. It opens no game, display, device or network receiver.
It tests independent watchdog behavior when only the control thread fails; it
does not supply owned-game/browser fault costs, whole-camera death evidence,
restoration proof or acceptance of the qualification protocol's fault scope.
