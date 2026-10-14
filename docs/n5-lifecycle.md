# N5 bounded lifecycle and fresh recording control

**Delivered:** Step 4 software, 2026-10-11. [Handoff](n5-scenario-harness.md).
[Concrete camera/CPU adapters and fixed effect checks](n5-adapters.md) are delivered
in Step 5 software; [export/adoption](n5-experiment-export.md) is delivered in Step 6. Real execution is recorded in the [live procedure](n5-live-test-procedure.md);
full acceptance remains open.

`engine/runtime/scenario_harness/` supplies a stdlib-only, opt-in synchronous
runner with an immutable local `RunPlan`, exact workload/recording/worker ownership
inventory and a private lease/journal. It never imports the sibling core or starts
processes itself. All six phases, actual runner offsets, contiguous covered counter
prefixes, action attempts and cleanup outcomes remain visible in internal execution
records. These private records are inputs to [Step 6 export](n5-experiment-export.md), rather than public `ExperimentResult` roots, and contain no
verified effect claim.

`RunPlan` bounds seeds, worker counts, phase order/durations, total watchdog,
pressure duration and per-phase trace capacity using exact integer ceilings.
`ScenarioRunner` is single-use. It passes the seed to the runtime, checks cancellation
and monotonic deadlines, preserves actual transition delays, retains only valid
counter intervals, rejects reset/worker-count/generation changes and performs owned
restoration before recovery. Degraded→probe counters retain one continuous boundary;
N4 recording clocks still restart independently. Fractional-second final intervals
are coalesced within the frozen 0.5–5 s evidence bounds.

Live acceptance found that stamping interval end before reading owned CPU could
falsely exceed the strict capacity bound on a saturated first sample. The runner
now stamps the receipt after reading counters; it does not clamp CPU or relax
the bound. Final abort cleanup also records action-stop/cleanup offsets when the
original measurement clock is still valid and every owned restoration succeeds.
A failed/regressed measurement clock remains unknown even when the independent
watchdog releases resources. This closes the missing abort receipt without
fabricating recovery measurements or accepting an incomplete run.

## Runtime hook contract

[Step 5 supplies the concrete camera/CPU adapter](n5-adapters.md). Hooks are trusted
local implementation code, not serialized callbacks, shell commands or plug-ins.
The runner cannot preempt an arbitrary blocking Python/GI hook: every hook must use
its `Budget`, bounded system APIs and cooperative cancellation. `wait_until` must
poll cancellation/deadlines while waiting; subprocess waits/TERM/KILL/reap must
have explicit deadlines. Returning after a deadline fails the run. A fake hook
passing this contract does not certify a live adapter.

| Hook | Required behavior |
| --- | --- |
| `prepare(plan)` | Allocate exact opaque resource/generation identities only; no children, recording or runtime mutation |
| `open(plan, resources, budget)` | Verify declared runtime/workload and initialize under durable ownership intent |
| `start_action(plan, budget)` | Start only prepared owned workers; return true on observed startup, never on effect verification |
| `stop_action(budget)` | Stop/reap exact workers; return true only on successful stop |
| `start_recording(phase, budget)` / `finish_recording(phase, budget)` | Call the explicit single-peer controls below; no export in callbacks |
| `wait_until(deadline_ns, budget)` | Wait cooperatively in the same runner clock; no backdated phase times |
| `counters()` | Return `Counters` from one draining peer and only owned worker CPU generations |
| `owns(resource)` | Verify exact token and generation, including native handles in the future adapter; never guess a PID |
| `restore(resource, budget)` | Bounded, idempotent restoration/reap for that exact resource; attempt other owned resources after a failure |
| `cleanup_clock()` | Private monotonic watchdog for final release, independent of measurement-clock failure |

Action restoration offsets use the runner clock before recovery. Final lease/resource
release uses private watchdog timestamps, which are not N5 evidence offsets and
must never be copied into exported roots. A regressed measurement clock stays
aborted; a fresh cleanup watchdog cannot repair its evidence.

## Private ownership journal

Provision an owned mode-0700 runtime directory outside public artifacts. The lease
and atomic journal are mode 0600 regular files, opened relative to a pinned directory
with no-follow checks. A nonblocking `flock` rejects a second owner. The journal
records opaque identities/generations before `open` or action startup; failed cleanup
retains dirty intent. Both normal and restart paths attempt owned resources in
reverse acquisition order within a ten-second cooperative deadline.

A later owner must explicitly call `RuntimeLease.recover(runtime, budget)` and verify
every exact resource generation. Unknown/foreign ownership is retained as dirty and
never restored by guess. A clean lease can begin a new run; active/dirty intent cannot
be overwritten. This implements journal/ownership decision logic, not actual native
child reconstruction by itself. [Step 5 native worker ownership](n5-adapters.md)
now supplies durable parked-child identities, pidfd recovery and bounded TERM/KILL/reap; SIGKILL cannot promise cleanup.

## Actual camera recording control

`camera.create_peer_recording_control(peer_id, config)` requires one exact peer,
an existing opted-in `HostTraceBinding`, and no previous controller. It replaces
only that peer's trace ownership slot with `PeerRecordingControl`; it adds no socket
command or normal-player UI flow. Start phases in healthy/degraded/probe/recovery
order and finish each before starting the next. Default tracing-disabled playback
still installs no trace probes. Both Dockerfiles ship the new helper and harness.

A one-second bounded IDLE barrier blocks capture admission while old probes retire
and a fresh collector/clock installs. The source remains blocked across a recording
transition, then resumes after the new binding is ready. This uses GStreamer's
[documented IDLE probe semantics](https://gstreamer.freedesktop.org/documentation/additional/design/probes.html).
A private segment/PTS high-water boundary prevents old admitted downstream buffers
or retired callbacks from joining new frame associations. No PTS or handoff state
enters public records. Loss, capacity and new-segment rules remain N4's existing
rules. Missing admission evidence, barrier timeout or incomplete probe retirement
fails closed; cleanup retains exact failed registration/removal handles for retry.

Barrier callbacks only acknowledge idleness; filesystem/core/export work stays on
the control thread after recordings freeze. Rotation introduces a deliberate
short source pause whose live cost must be measured. The original warm-up collector
is separate from the four measured phase collectors and is never relabelled.
The legacy shutdown exporter still belongs to its initial N4 recording; [Step 6](n5-experiment-export.md)
explicitly exports the frozen phase collectors returned by `finish_phase`, rather than
mistaking a warm-up shutdown artifact for a post-warm-up measurement.

## Local verification and remaining gates

```sh
python3 -m unittest discover -s engine/runtime/tests/python -p 'test_scenario_*.py' -v
python3 -m unittest discover -s engine/runtime/tests/python -p 'test_camera_trace*.py' -v
npm run test:engine
```

Fake-clock/runtime tests cover healthy/contention phase execution, fractional bounds,
capacity, cancellation, clock/counter/ownership failure, failed startup/stop/restore,
duplicate leases, restart recovery and cleanup deadlines. Fake Gst pads exercise
actual collectors/control, old queued buffers/callbacks, source barriers, registration/
removal failure, duplicate owners and actual camera control/teardown functions.
The Node engine suite runs these Python cases and checks both image COPY lists.

No real pressure worker, Linux/GI playback, container build, measured effect or
paired overhead trial was run in Step 4. [N4 tracing acceptance](n4-stage-trace-export.md)
records the current nominal/overhead/lifecycle results. Actual Node 24 execution
now passes; hosted CI remains unverified. Healthy plus one approved CPU
class does not meet Phase 1.3's two real bottleneck-class gate. Concrete supported
adapters and fixed effect predicates are delivered in [Step 5](n5-adapters.md); [offline bundle verification](n5-experiment-export.md) is delivered in
Step 6; [independent release pins](n5-experiment-reproduction.md) are delivered in Step 7.
