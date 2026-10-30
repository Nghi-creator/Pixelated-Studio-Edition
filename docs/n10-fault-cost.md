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

## Owned-game controller-thread exit cost

The separate mode `engineering-game-controller-thread-exit-cost` uses the owned
Linux game, actual dedicated peer worker and authenticated headless receiver.
Its fixture-only launcher wraps the worker's snapshot method; the normal worker
entry point and production configuration have no fault hook. After the host
observes the target cadence, it publishes a private marker bound to the exact
request and generation. A healthy 24 FPS snapshot on the controller thread then
raises `SystemExit`, terminating only that thread.

The child main loop must subsequently observe the controller thread dead,
unchanged 24 FPS caps and an advancing encoded-buffer counter. An atomically
published local observation records this before the result event. The independent
guards and supervisor remain enabled; their teardown can race, so the acquisition
does not attribute which one killed the worker. No camera, game, display or
sibling process is a signal target.

```sh
npm run smoke:n10-browser-native -w @pixelated/engine-runtime -- \
  --image "$N10_NATIVE_IMAGE" --mode engineering-game-controller-thread-exit-cost
```

For retained acquisition, call `acquireNativeCohort` with this one explicit mode
and a fresh absolute output path, then inspect the original one-record array:

```sh
PYTHONPATH=engine/runtime python3 -m live_probe_control.thread_exit_cost_screen \
  "$N10_THREAD_EXIT_COST"
```

The method is `n10-contained-controller-thread-exit-cost-v1`, role
`contained_game_controller_thread_exit_cost_not_qualification`. The two-second
request reserves four seconds. Missing controller results remain missing;
the journal must retain `active` unresolved intent through worker replacement
and issuer restart, and a new action must remain blocked. The same bounded
container cost checkpoints and separate browser span apply. Supplied lifetime
and journal consistency checks do not authenticate execution or approve costs.

This case establishes a scoped thread-exit observation, not a blocked controller
thread in this game/browser context, whole-camera death, perceptual/audio
acceptance or qualification. Existing evidence roots keep their original case
inventories; do not relabel this record into an earlier four-case cohort.

## Owned-game blocked-controller cost

The separate mode `engineering-game-controller-thread-block-cost` parks only the
controller thread in a ten-second event wait after a healthy target snapshot.
That wait exceeds the unchanged four-second action reservation; it does not spin,
disable a guard or alter a teardown deadline. The same private request/generation
binding and fixture-only launcher apply.

Before teardown, the child main loop must observe the controller thread still
alive, at least 100 ms since fault injection, at least three additional encoded
buffers, and both configured and negotiated cadence still at 24 FPS. A thread-exit
observation cannot satisfy this case. The worker must subsequently be killed and
reaped with no controller result, retaining unresolved intent and its full
reservation through replacement and issuer restart. Sibling and owned source
lifetime/progress checks remain required.

Use the acquisition command above with
`--mode engineering-game-controller-thread-block-cost`. Retain its original
one-record array in a separate output and inspect it with:

```sh
PYTHONPATH=engine/runtime python3 -m live_probe_control.thread_block_cost_screen \
  "$N10_THREAD_BLOCK_COST"
```

The method is `n10-contained-controller-thread-block-cost-v1`, role
`contained_game_controller_thread_block_cost_not_qualification`. Its bounded
container CPU checkpoints and independent browser span keep the existing
exclusions and false live authority. This is scoped blocked-thread evidence;
whole-camera death, reviewed cost/quality limits and production activation remain
separate requirements.

## Whole-camera death cost

`engineering-game-camera-death-cost` abruptly terminates the fixture's actual
camera process during an observed 24 FPS action. The relay starts a separate
local monitor. Before any signal, that monitor pins the relay's directly owned
camera and its two media workers, game, display and Pulse processes by exact
pidfd lifetimes, verifying their parentage and capture binding.

The monitor sends SIGKILL only to the pinned camera. Both workers must exit
without a direct signal from the monitor. The observation does not attribute
their exits to a specific lease guard, watchdog or capture-health path. The
game/display/Pulse processes must remain alive until the monitor's explicit
fixture cleanup. Cleanup signals use their already-pinned lifetimes; completion
requires those process lifetimes to disappear and no non-ancestor processes to
remain in the private container cgroup.

The relay must reap the actual camera with SIGKILL. The action's journal must
retain the same unresolved active request, one action and four-second reservation
through that run. A new controller must reject dispatch against this journal;
no recovery or budget refund is performed. A missing controller result remains
missing, and restoration remains `unavailable_camera_died`.

```sh
npm run smoke:n10-browser-native -w @pixelated/engine-runtime -- \
  --image "$N10_NATIVE_IMAGE" --mode engineering-game-camera-death-cost
```

Retain an original one-record array with `acquireNativeCohort` and inspect it with:

```sh
PYTHONPATH=engine/runtime python3 -m live_probe_control.camera_death_cost_screen \
  "$N10_CAMERA_DEATH_COST"
```

The separate method is `n10-contained-camera-death-cost-v1`, role
`contained_camera_death_cost_not_qualification`. Camera-side checkpoints cover
before dispatch and fault readiness; external monitor checkpoints cover before
the camera kill, worker exits and owned descendant cleanup. These use the same
private cgroup CPU counters and Linux monotonic clock. The browser span retains
its independent clock. Short-stage CPU percentages are descriptive measurements,
not reviewed limits or synchronized system totals.

This interval includes explicit owned game/display/Pulse teardown. It differs
from earlier camera-through-cleanup-callback intervals. Initial source startup,
later relay/monitor/interpreter/container/browser exit, individual ancillary
costs and browser cleanup/RSS/GPU remain excluded. Browser cleanup is explicitly
requested by the fixture after the monitor completes; the acquisition does not
establish automatic desktop disconnect behavior or a full camera restart and
reconnect. The earlier method inventories and evidence roots remain unchanged.
