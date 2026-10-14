# N5 supported adapters and measured effects

**Delivered:** Step 5 software, 2026-10-11. [Lifecycle](n5-lifecycle.md),
[current handoff](n5-scenario-harness.md). [Export/offline inspection](n5-experiment-export.md) is delivered in Step 6.

`engine/runtime/scenario_harness/camera_runtime.py` implements opt-in trusted
control-thread hooks for an existing Linux camera peer. It does not start the
camera on import or expose a socket/UI command. `healthy` uses no workers;
`host_contention` uses only bounded owned children. Every other v1 scenario remains
unavailable. The sibling core's frozen N5 contract/predicates remain unchanged.

## Actual runtime preflight

Construct `LinuxCameraRuntime(camera, peer_id, lease, workload)` with an existing
camera module, private `RuntimeLease` and immutable `WorkloadDeclaration` containing
a sanitized workload alias, seed and actual Node version from the campaign owner.
Call `preflight(plan, budget)` before `ScenarioRunner.run(plan)`. It returns explicit
availability/reason and an immutable tuple of runtime metadata, without children,
recording changes or pressure. Unavailability exports as unsupported through Step 6,
with no phase/effect numbers; it is never retried by silently switching runtimes.

Checks include actual Linux, monotonic clock/resolution, affinity and every visible
cgroup v2 ancestor CPU quota, one exact peer/pipeline, stable PLAYING state,
connected WebRTC transport, X11 capture configured on `:99`, a PulseAudio monitor
source, actual VP8 input caps at 1280×720/30, existing unowned opted-in trace binding,
and observed encoder counter progress within one second. Contention additionally
checks pidfd and high-resolution process CPU clock access without spawning a child.
Fractional allocations below one core, unsupported/hidden cgroup hierarchy and
unknown sources fail closed. Requested workers may not exceed observed allocation.

The campaign owner must preload and keep the known nonprivate scene stable under
the declared seed and supply its reproducible scene/configuration recipe. The
adapter records that declaration; it cannot infer scene content or the remote
engine's Node version from camera pixels. Python/GStreamer versions, clock and CPU
allocation come from the local runtime. A declaration alone is not a real trial.

`prepare` creates opaque identities only and refuses changes to the preflight
plan. `open` requires matching durable lease intent before claiming recording
ownership. Frame snapshots use that exact peer's cumulative encoder output counter,
never the aggregate telemetry file. Source/caps/profile/encoder settings, peer
generation and CPU allocation are checked during collection; reset/disconnect or
configuration drift aborts. Retired camera callbacks cannot count into a new peer
that reuses its private ID. Existing player behavior gains no new callback I/O.

The workload remains under its campaign owner. The adapter changes no network,
scene, stream profile or machine setting. Final restoration closes owned recording
handles and reaps pressure workers; it leaves the existing pipeline under its owner.
Each camera recording owner is single-use; another campaign run must provision a
fresh opted-in peer through the existing owner rather than reuse a closed controller.

## Native pressure ownership and bounded recovery

`pressure.py` owns trusted isolated `pressure_child.py` subprocesses, launched with
the current Python executable, a fixed local helper path and validated 40–300 s
duration. There is no shell, user command, process-name scan or group-wide kill.
Helpers create no descendant processes and mutate no machine settings.

All helpers first acknowledge READY and stay parked. The owner retains each exact
child handle and pidfd immediately, then atomically fsyncs a mode-0600 private
sidecar containing the resource token/generation, PID, boot identity and process
start tick. Every child is durably parked before the first GO. ACTIVE acknowledges
startup only. Startup failures keep acquired handles available to cleanup.

Worker CPU comes from the exact process's Linux high-resolution CPU clock;
`/proc` start ticks identify generations, not rounded CPU utilization. The runner
retains integer counter deltas; pressure observations never use camera CPU or the
shared resource telemetry sampler. Unexpected exit, regression or generation change
aborts. Evidence exceeding owned-worker CPU capacity is rejected rather than clamped.

Cleanup targets only pidfds whose pinned process identity matches. It sends TERM,
waits at most one second within the remaining budget, then KILL if needed and
bounded exit/reap. All owned children are attempted; an exhausted budget or failed
restoration remains unsuccessful and preserves dirty intent. Successful stops are
idempotent. Recovery opens the recorded PID's pidfd **before** checking its boot/start
identity. Foreign generations receive no signal. Native sidecars stay private and
the next clean run removes only the previous bounded inventory's sidecars.

For interrupted owners, reconstruct `PressureWorkers` using the active lease's
exact pressure resources and call bounded `stop`; this restores only native workers.
The lease becomes clean only after a runtime independently verifies/restores every
workload and recording generation through `RuntimeLease.recover`. A new camera
process cannot reconstruct old GI handles by guessing and must retain unknown
ownership as dirty. Parked children exit on stdin EOF or a five-second timeout;
active children stop on EOF/STOP and have an independent monotonic watchdog.
SIGKILL of the owner cannot promise whole-runtime restoration.

## Fixed measured-effect calculation

`evaluate_effect(plan, execution, adapter_available=...)` returns an immutable
`MeasuredEffect` from raw private execution intervals. It is separate from the
runner's completion flag and injector handshake. Integer sums/cross multiplication
decide predicates; floating-point rates are output presentation only.

Availability precedence is adapter unavailable → incomplete run → cleanup
unverified → insufficient evidence. Invalid intervals, gaps, regressions, unexpected
workers and CPU above owned capacity cannot supply rates. Healthy/degraded/recovery
each need at least 30 complete intervals and 30 seconds. All phases must have
complete bounded contiguous raw coverage and their expected workers.

Healthy requires all three FPS values ≥27 and no workers anywhere. Host contention
requires healthy FPS ≥27, degraded owned CPU ≥50% of one core, degraded FPS ≤95%
of healthy and recovery FPS ≥95% of healthy, with zero workers outside degraded/probe.
Failure priority is baseline, pressure, degradation, recovery; equalities pass.
Multiple workers may legitimately yield CPU above 100% of one core. Unavailable
effects retain null rates. Startup alone cannot verify pressure or degradation.

These private results do not prove artifact hashes, detached cross-root associations,
scientific causality, confidence or held-out separation. [Step 6](n5-experiment-export.md) exports and
verifies those associations before accepting a public experiment bundle.

## Verification and pending execution

The Node engine suite discovers `test_scenario_*.py`, including independent Step 2
arithmetic, one-unit boundary failures, unavailable precedence, fake native
activation/durability, partial startup, TERM/KILL/reap, restart, missing/reused PID,
deadline and actual camera hooks with fake Gst dependencies. A Linux-only integration
test spawns an actual parked child and sends EOF without GO; it never runs pressure.
That integration test was skipped in the original macOS checks. The subsequent
Linux run passes all 78 scenario tests, including actual parked-child cleanup.
Real pressure/capture outcomes, retained failures and remaining overhead/version/hosted
gates are recorded in the [live procedure](n5-live-test-procedure.md) and linked
core runtime ledger.

The original v1 healthy/CPU support alone cannot pass Phase 1.3's two real bottleneck-class
gate. N4's nominal capture/coverage/overhead and host lifecycle gates now pass;
the browser execution method also passes local validation; final desktop/hosted
acceptance remains open. [Independent fixture pinning and reproduction](n5-experiment-reproduction.md) are
delivered in Step 7. Fresh campaign-8 now passes all 18 healthy/CPU/pacing reference/query trials;
selected-scene overhead also passes. Browser execution method checks also pass locally. Normal desktop interaction
and hosted checks for final browser changes in both repos remain open.

## Additive capture pacing

The [live test workflow](n5-live-test-procedure.md) adds an opt-in identity element
with fixed 50 ms pacing in degraded/probe, restored before recovery and guarded
by an exact-element watchdog. Its additive experiment-v2 method independently
checks observed stage delay and throughput/restoration; the setter is not ground
truth. V1 roots/pins are unchanged. Real pacing effects have been observed; the complete
corrected cohort and remaining acceptance gates are tracked in the live ledger.
