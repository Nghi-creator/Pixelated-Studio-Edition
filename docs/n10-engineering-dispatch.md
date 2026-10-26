# Synthetic engineering controller dispatch

The dedicated peer worker can run the existing cadence controller through an
explicit local engineering configuration. This path supports only
`isolated_synthetic` media. Production x99/Pulse workers reject the configuration
in the camera adapter, bootstrap protocol and child runner. The normal camera
worker option does not enable it. There is no network or browser mutation endpoint.

This exercises ownership, bounded action execution and restoration; it does not
qualify a live relief family. Results retain `live_authority=false`. Receiver
observations in the contained tests come from native Gst sinks and remain declared
engineering observations, not authenticated browser playback or perceptual proof.

## Explicit configuration and local calls

The host first opens an `EngineeringControl` for one existing private directory
and typed policy:

```python
from live_probe_control.probe_transport import EngineeringControl
from live_probe_control.camera_workers import CameraWorkers

control = EngineeringControl.open(private_directory, policy)
workers = CameraWorkers(
    profile, "[]", 2, source="isolated_synthetic", control=control,
)
```

The directory is selected once for the owner/session. Configuration pins its
path, device/inode and policy. Every child generation uses that same directory;
peer IDs and requests cannot choose another one. `CadenceJournal` retains its
private-file, no-follow, nonblocking exclusive lease and durable intent rules.
No new persistent budget format is introduced.

After establishing a current receiver binding and fresh native/declared progress
with [local admission](n10-local-owner.md), the owner prepares a draft and calls
`dispatch(owner, draft)`. Dispatch rechecks the issued draft, binding, expiry,
policy and configured directory. It returns a process-local `ProbeOperation`.
Only one operation may be active per owner scope and per worker slot. Separate
scopes/peers still contend on the same controller journal lease; they cannot
reserve independent per-peer budgets. Repeating dispatch with the same issued
draft returns its original generation-bound handle without issuing another action.

Immutable draft flags describe the preparation receipt and stay false; a draft
is not an execution permission. Engineering dispatch additionally requires the
explicit configuration above. The operation's `status` becomes `running`, then
`observed`, `rejected` or `worker_lost`. `observed` means a typed result arrived;
inspect its outcome/restoration fields rather than assuming success. Loss without
a result leaves `result=None`. Cached handles retain their original request and
generation and never describe a replacement peer.

The owner must keep polling the camera service and supplying fresh scoped
receiver observations while waiting. `cancel(owner, operation)` requests
cancellation without requiring an unexpired admission draft. Continue supplying
receiver progress until restoration/result completes. Receiver capabilities,
foreign owner capabilities and unissued operation handles cannot cancel actions.
Closing a scope requests cancellation but stops its observation stream; teardown
and retained dirty intent may follow if independent restoration cannot be proved.
Always close the camera service as part of owned host cleanup.

## Private transport and child execution

Private IPC version `n10-peer-ipc-v3` adds closed `probe`, `probe_heartbeat` and
`probe_cancel` commands and `probe_result` replies. Bootstrap optionally carries
the fixed engineering configuration; it cannot be enabled later by a probe
message. Previous IPC versions are rejected. There is no generic property setter,
caller pipeline expression or executable payload. Replies retain the original
command hash and generation, and the result's request ID is checked before an
operation handle is updated.

The adapter reserves protocol headroom before starting an action and coalesces
the latest receiver observation at intervals of at least 150 ms. It does not
synthesize progress when no new report arrives. All private buffers, outstanding
requests, counts and deadlines remain bounded. Cancellation and result handling
run on the peer control thread, off GLib/media callbacks.

The child also keeps its main IPC/media loop responsive. A separate controller
thread performs the synchronous action under the existing exclusive journal
lease. Only the dedicated CLI worker may construct an eligible controller port;
importing the module cannot make the camera process eligible for its process-
killing watchdog. Actual source progress is checked before reserving an action.
The controller writes intent/full reservation and arms its exact-worker watchdog
before the setter. Only the request's target cadence and captured baseline are
permitted; a foreign configured cadence is never overwritten during cleanup.

A child receiver lease requires advancing observation sequence/counters and
fresh host receipt stamps. It expires after 750 ms of missing report/progress.
Caller-reported browser elapsed time is not used as host freshness. These control
stamps use the shared Linux kernel monotonic clock of the parent and its direct
child; they are separate from child-relative trace timestamps and receiver clocks.
Readback checks native connection, source progress, profile settings and cadence.
During an issued operation, the parent admits only that operation's explicit
baseline/target transitions; arbitrary setting changes still invalidate the
binding. New drafts wait for baseline observations after completion.

Restoration requires configured and negotiated baseline cadence, unchanged
non-cadence settings, fresh source progress and at least two new receiver updates
with advancing decoded/presented counts after cleanup begins. This is a bounded
engineering restoration proof, not a quality or rate-effect assessment.

## Failure, budget and recovery

Cancellation with continuing valid receiver progress can return a verified abort.
Receiver loss, blocked native work, partial setter failure or uncertain journal
completion cannot be reported as verified restoration. Unknown results retain
dirty intent and trigger exact-worker SIGKILL by the supervisor, including failure
after a watchdog was disarmed. A hung worker that cannot reply remains bounded
by the independent watchdog, parent snapshot/reply deadlines and lifetime lease.
The game and sibling workers are outside these termination targets.

Reservations are not refunded on abort or teardown. A replacement uses the same
ledger and cannot reset action count, cumulative reservation or cooldown. Recovery
uses the existing `CadenceController.recover_after_teardown()` local procedure:
prove the exact recorded old lifetime is gone, acquire the same private lease,
retain spent budget, and label recovery `not_verified_teardown`. There is no remote
recovery command. Teardown recovery does not assert that the previous live stream
was restored.

Typed operation results are local lifecycle receipts. They are not standalone
cadence/game-browser evidence bundles and must not be presented as qualified probe
exports. Existing offline evidence roots and byte pins remain unchanged.

## Verification and remaining scope

Software protocol/owner/lease checks:

```sh
python3 -m unittest discover -s engine/runtime/tests/python \
  -p 'test_live_probe_dispatch*.py' -v
```

Inside the contained Linux native runtime, from `engine/runtime`, opt in with
`N10_NATIVE_PEER_TESTS=1` and use `-s tests/python`. The native tests exercise
completion/restoration, cancellation, repeated dispatch, budget exhaustion after
worker replacement, receiver-loss teardown, a SIGSTOP-blocked worker, and exact
old-lifetime recovery. A second decoding peer and separately owned Frozen-Bubble
game must survive. Use the [peer-worker isolation procedure](n10-peer-workers.md)
for read-only mounts, internal-only networking and resource/deadline bounds.
Software fault tests also cover partial native setter changes, foreign cadence,
unknown results after watchdog disarm, and intent persisted before its in-memory
copy updates.

Production activation still requires authenticated browser observation binding,
action-time browser/desktop acceptance, supported quality/disturbance bounds and
qualification through the actual production path. This engineering option does
not satisfy those conditions or close N10.
