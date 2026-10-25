# Default-disabled dedicated-worker cadence controller

`engine/runtime/live_probe_control` implements a local lifecycle kernel for the
capture-cadence candidate. It is disabled by default and has no camera, server,
LAN, guest or automatic telemetry binding. Importing it creates no process or
pipeline. This is not a qualified live capability.

The earlier [isolated experiment](n10-cadence-feasibility.md) establishes a limited
source-control feasibility surface. The lifecycle kernel adds ownership, durable
intent, conservative budgets, cancellation, independent process teardown and
recovery. The explicit isolated worker below binds a disposable Gst WebRTC
receiver and verifies received-frame recovery. A production camera/browser port
and quality qualification remain required. Fake-port tests establish software
behavior only. The frozen core bitrate-evidence format is unchanged.

## Local request/result boundary

The package exports `CadenceController`, `Generation`, `Policy`, `Request`,
`Snapshot` and `Result`. These frozen Python declarations form a local producer
API, not an accepted core artifact schema or an executable network protocol.

`Generation(owner, pipeline, peer)` carries three bounded aliases. The port must
bind them to exact owned object/process lifetimes and generate new identities on
replacement or competing control, including a foreign write of the same FPS.
Getter equality alone cannot establish ownership of a competing action. A request
has a bounded opaque request ID, that exact generation,
integer target FPS and duration in nanoseconds. There are no caller-selected
property names, pipelines, devices or arbitrary actions.

An explicit `Policy` supplies minimum/maximum FPS, maximum requested duration,
action count, cumulative reservation, cooldown, maximum reduction percentage and
settling time. Engineering ceilings are 24–60 integer fps, five seconds requested
duration, 64 retained requests, 60 seconds cumulative reservation, one-to-sixty
seconds cooldown, at most 50% reduction and at most 500 ms settling. Requested
duration must exceed settling. These bounds restrict the software surface; they
are not empirically qualified safety/quality thresholds. The 15 fps isolated
experiment is not a default policy and cannot be submitted to this controller.

`Snapshot` retains exact generation, configured/negotiated integer FPS, a digest
of all unrelated settings and typed health. Port getters cannot silently round
fractional framerates or invent health. The requested FPS must be below the
healthy agreed prior rate and satisfy the supplied bounds. After settling, actual
negotiated FPS must match; a configured setter alone cannot complete the action.

Results retain request ID, outcome, restoration and a closed reason. Outcomes are
`completed`, `aborted`, `unknown` or `interrupted_teardown`. Restoration is
`verified_by_port`, `unknown` or `not_verified_teardown`. `verified_by_port` means
only that the supplied port returned its required independent proof; it is not
an accepted research/receiver qualification. Every result fixes
`live_authority=false`.

## Required port and dedicated process

An explicitly enabled controller requires `port.dedicated_process is True` and:

- `snapshot() -> Snapshot`: exact ownership, caps/settings and independently
  supported health/progress. Do not report an idle or disconnected receiver as
  healthy merely because a property getter succeeds.
- `set_fps(integer)`: change only the owned source-caps cadence control. A raised
  setter may already have changed it; retain intent and reconcile ownership.
- `verify_restored(prior, deadline_ns) -> bool`: independently verify the prior
  cadence, settings, connection and output/receiver recovery within the deadline.
  A default `True`, a setting getter or a local-decoder-only observation is not a
  production implementation of this port.

The isolated worker implements these interfaces for its own fixed Gst pair only.
A production binding must use an owned dedicated pipeline worker and qualify
representative workloads, browser receiver continuity and quality/cost bounds.
The existing
multi-peer `camera.py` process is not such a worker: killing it would affect other
peers. Never attach this watchdog to that process as a shortcut.

## Durable lifecycle and idempotence

Create a distinct, owner-only mode-0700 state directory before entering the
controller context. Its mode-0600 regular files use no-follow opens, nonblocking
single-owner file locking, checksum-protected bounded duplicate-safe JSON and atomic replace with
file/directory fsync. `private_journal.py` shares only these I/O mechanics with N5;
N10 journal versions, requests, budgets and recovery semantics are separate.
Do not use an N5 directory. Files and process identities remain private, not
research artifacts.

Before any setter, the journal durably records the request, prior snapshot, exact
worker identity and a reservation of **requested duration plus two seconds**.
The latter covers settling, uncertain application and restoration grace. Accepted
reservations are never refunded or reset by replay, failed setters, recovery or
restart. The ledger reconstructs counts/reservations from its entire bounded
history. A changed policy hash is rejected rather than resetting budgets. A
reboot imposes a fresh full cooldown while preserving counts and reservations.

The independent watchdog must acknowledge startup before mutation, followed by
another exact preimage check. Cancellation, lost health, changed unrelated
settings, foreign values, generation replacement and clock regression abort.
Cleanup only restores the same owned generation while its current configured
rate is either the prior or this request's value. A foreign value/generation is
never overwritten. Incomplete/failed restore proof leaves dirty state and the
watchdog armed.

Successful completion uses two phases: persist `restored_pending_watchdog` with
intent still blocking new actions, obtain watchdog-disarm acknowledgement, then
durably commit clean and cache the result. A failed acknowledgement or write
cannot bypass the pending state. A final commit that raises after replacement
may be observed as committed on restart; its restoration and watchdog facts
already preceded it, so replay returns the retained result without reapplying.
Repeated identical IDs return retained
outcomes without another setter; conflicting content is rejected. An interrupted
intent with no result blocks retry until teardown recovery. A retained dirty
failure can be read idempotently but cannot authorize another action.

## Independent watchdog and crash recovery

The Linux watchdog is a separate process with a pidfd opened for the exact
calling worker. It holds no controller/media lock. Timeout or loss of the private
control pipe kills that worker with SIGKILL; it never obtains a kill target from
the journal or a process-name scan. Cancellation requires the explicit private
pipe acknowledgement after durable restoration proof. Kernel/platform support
and startup acknowledgement are mandatory; unavailable watchdogs prevent mutation.

The watchdog bounds a hung setter/control/verification thread by the full reserved
lifetime. SIGKILL destroys the dedicated worker and its pipeline; it does not
promise in-process rollback. A dead/dirty worker leaves durable intent. Another
controller cannot clear it merely because a new pipeline looks healthy.

`recover_after_teardown()` requires the same policy hash and proof that the exact
old boot/PID/start-time lifetime is gone. It never signals a PID from disk and
never restores into the replacement generation. Recovery records
`interrupted_teardown` / `not_verified_teardown`, retains all consumed budgets,
and imposes a full cooldown. This is explicit interruption, not successful live
restoration. Uncertain identity or a still-live old worker keeps recovery blocked.

Run the software and native watchdog checks with:

```sh
cd engine/runtime
python3 -m unittest discover -s tests/python -p 'test_live_probe_*.py' -v
```

The three pidfd tests run only on Linux and use dedicated child test workers.
Build/Node tests run the Python boundary suite and verify both image recipes ship
the package and shared journal helper. No normal gameplay or public activation
path is added by these checks.

## Explicit isolated WebRTC worker

`live_probe_control.webrtc_worker` creates its own synthetic moving-ball sender
and Gst `webrtcbin` receiver, negotiates SDP/ICE locally, and receives VP8 through
WebRTC before decoding into a bounded appsink. It accepts no caller pipeline,
display, device, peer, SDP or ICE-server configuration. Importing it does not load
GI or start media. The importable port is not marked as a dedicated process;
only the explicit module worker binds the controller watchdog.

Run it as a **standalone disposable Linux process**, never from the camera/server
process or an existing Python worker with other responsibilities. The state
directory must already exist, be owned by the current user, and have mode 0700.
Keep that directory after failure for journal inspection/recovery; never delete
it to reset a dirty request or budget.

```sh
cd engine/runtime
mkdir -m 700 /tmp/n10-webrtc-state
python3 -m live_probe_control.webrtc_worker --isolated-webrtc-trial \
  --state-directory /tmp/n10-webrtc-state
```

Use a new explicit directory for each independent disposable experiment. Reusing
a retained request ID with a new pipeline generation fails rather than replaying
control into a replacement worker. There is no network request or normal-camera
activation route. The packaged module is copied with `live_probe_control` in both
runtime images.

The fixed provisional context is 640×360 VP8, 1 Mbps, 30→24→30 integer capture
FPS, a three-second request, 500 ms application settling and a five-second total
watchdog reservation. Encoder controls and dimensions stay fixed. These are
experiment parameters, not a production quality floor or qualified policy.
Source caps are read back exactly. Unrelated encoder settings are hashed on each
snapshot. New pipelines/peers get fresh opaque generations and the port closes
its generation at teardown; it exposes no competing control route.

Health requires both peers connected, both pipelines in stable PLAYING, fresh
received frames, strictly increasing receiver PTS with gaps at most 250 ms and
nonregressing pull times with gaps at most 500 ms. Missing/reversed/stale output,
queue overflow and native ERROR/EOS fail closed. Signaling waits, callback
signaling queues, sample pulls, snapshots, timeline size and total trial lifetime
are bounded. Media callbacks only forward bounded ICE or link the one expected
receiver pad; cadence control and proof run outside media callbacks. Session
descriptions are copied before their Gst promises are released.

Restore proof excludes 200 ms settling, then measures 750 ms of fresh source and
received-frame progress at the prior cadence (inclusive ±10%), alongside exact
prior snapshot/connection health and the controller deadline. JSON retains
setter brackets, source/receiver counter observations, baseline/during/restoration
windows and pull times on a process-relative monotonic clock. Received PTS use
the receiver pipeline clock and are not aligned to source/browser time. Window
screens use exact integer arithmetic and ±10% rate tolerance. `status=observed`
means the trial returned evidence; inspect `assessment` separately. This is a
producer operator report. Core can import it into the separate
[cadence evidence format](../../latency_fingerprinting/docs/live_probes/N10_CADENCE_EVIDENCE.md);
it is never relabeled as the frozen bitrate-only `live-probe-evidence-v1` root. Quality is explicitly `not_evaluated`
and live authority remains false.

`--isolated-webrtc-cancel` cancels after one second and requires owned restoration.
`--isolated-webrtc-disconnect` deliberately stops the owned receiver after one
second. Failed proof retains dirty intent and the full budget; the worker emits
partial evidence, then waits for its independent watchdog to terminate it. A
SIGKILL/137 exit is expected for this fault drill. The native test then proves
the old worker lifetime is gone and exercises teardown recovery while preserving
its action count and reservation; recovery is labeled `not_verified_teardown`.
Neither NULL teardown nor
process death is reported as verified live restoration.

The loopback-only `--network none` Docker context may provide no usable libnice
candidate. Use a disposable **internal-only** Docker network with no STUN/TURN
servers for this local pair, retain state on a private mount, and enforce an
outer process/container deadline. Remove only the owned container/network after
the run. No external signaling service or internet access is needed.

Software boundary tests run with the command above. To opt into the three actual
native WebRTC success/cancel/receiver-loss tests in a contained Linux runtime:

```sh
N10_NATIVE_WEBRTC_TESTS=1 python3 -m unittest discover \
  -s tests/python -p test_live_probe_webrtc.py -v
```

These trials establish a synthetic Gst-to-Gst transport/controller path. Browser
playback, moving-game capture, perceptual quality, resource/disturbance costs,
production activation and representative evidence remain open. Offline cadence
export/inspection does not qualify these capabilities.


The separate [contained game/browser experiment](n10-game-browser-trial.md) uses
an actual fixed Frozen-Bubble level and headless Chromium to measure presentation
and resource observations. Its operator report has a distinct scope/version;
it does not widen the synthetic Gst cadence evidence root or qualify activation.

[Dedicated peer-worker transport](n10-peer-workers.md) describes the opt-in
one-pipeline process boundary and its contained isolation tests. Production
camera routing and live mutation remain disabled.
