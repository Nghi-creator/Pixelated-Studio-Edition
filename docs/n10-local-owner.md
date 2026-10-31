# Local probe admission

`engine/runtime/live_probe_control/local_owner.py` binds local request drafts to
one current dedicated camera worker and a scoped receiver observation stream.
`local_binding.py` owns bounded observation histories, draft value types and the
shared readiness checks used by admission and diagnostic explanations. The
owner API retains capability identity, ledger binding and dispatch ownership;
its existing public imports remain available.
It is default-disabled and import-safe. Normal camera startup does not construct
this API, and no Socket.IO, hosted, LAN, HTTP or file-watching command endpoint
calls it. Admission contains no cadence setter; a separate explicit synthetic
engineering configuration is required for its local `dispatch`/`cancel` methods.

This is a request-preparation contract. Every readiness receipt and draft keeps
`dispatch_available`, `budget_reserved` and `live_authority` false. A
`ready_for_dry_run` status establishes bounded software preconditions; it does
not qualify playback, perceptual quality, disturbance limits or a live probe.

## Local ownership and stable state

A trusted host-process caller explicitly constructs `LocalProbeOwner` with the
existing `CameraWorkers` service, a typed `Policy`, one absolute private ledger
directory and `enabled=True`, then enters its context. `claim()` returns its
process-local owner capability. `bind(owner, peer_id, token)` returns a separate
receiver capability for the exact current slot, worker generation and SDP offer
hash. Caller dictionaries, serialized aliases, independently constructed
capability objects and another scope's handles are rejected.

Receiver capabilities permit declared observations and read-only inspection.
They cannot prepare requests. Only the issuing scope's owner capability can call
`prepare` or `recheck`. These object identities distinguish trusted local calls
from observation input; they are not an operating-system sandbox against code
already trusted inside the host process. The optional browser observation bridge binds authenticated signaling/session
identity to an issued receiver handle; remote messages never obtain or select an
owner capability. Its data remains declared rather than authenticated playback.

The host chooses the owner/session ledger directory once. Peer IDs, request IDs,
receiver handles and worker replacements never derive a different path. Reads
reuse `CadenceJournal` ownership, mode, no-follow and nonblocking-lock checks.
The directory must already exist, belong to the process UID and have mode 0700;
the existing lease/journal files must satisfy their private-file rules. A scope
also pins the directory's device/inode and refuses path replacement. Existing
policy mismatch, dirty intent and durable request-ID conflicts block drafts.

Preparation/rechecking never writes `journal.json`, reserves action budget,
refunds a reservation, recovers dirty intent or resets cooldown. Reading may
create the existing private lease file. Multiple read-only scopes do not hold a
permanent execution lease. `CadenceController` remains responsible for exclusive
durable reservation, budget/cooldown checks, idempotent execution, watchdog,
restoration and teardown recovery when dispatch is implemented. A draft does not
promise that execution budget will be available.

When inspection is insufficient or stale, `readiness_diagnostics` explains the
failed preconditions with bounded native/browser samples, receipt/progress ages
and the unchanged freshness limits. These process-local diagnostics contain no
owner tokens or filesystem paths and never grant admission. Fixture readiness
failures, including fault/restart checks, retain the exact inspection responses; browser fixture snapshots also
retain a bounded list of collector stop reasons.

## Receiver and native evidence

`ReceiverSample` carries exact bounded integers for sequence, receiver-local
elapsed time, decoded frames and presented frames, plus a fixed receiver clock
alias. The first sequence is zero. Replays, gaps, clock replacement, reversed
elapsed time, counter resets and report gaps over one second invalidate that
binding. Parent receipt time is stamped by the local API, never accepted from
the report. Both decoded and presented counters must advance; fresh reports with
frozen counters cannot maintain readiness. Browser counters remain declared
observations, explicitly labeled `declared_counters_not_authenticated_playback`.

The local API also reads the supervisor's atomic native observation tuple:
validated snapshot, parent receipt time and observation sequence. Private peer
IPC version `n10-peer-ipc-v3` carries explicit native WebRTC connection and ICE
states; unknown reads stay `unknown`, and previous closed message shapes are
rejected.
A pipeline being PLAYING is insufficient: native connection must be connected
and ICE connected/completed. Capture and encode counters must advance between
two native observations. Missing values, stale receipts, repeated snapshots and
counter resets do not establish progress. Skipped observation sequences invalidate
the binding, preventing a missed interior reset from being hidden by a later
larger counter. Unchanged repeated reads do not create a second observation.

The current read-only scope supports the worker's fixed 640x480 source, exact
configured/negotiated profile cadence, bitrate and encoder settings. Unsupported
or changed native settings invalidate the binding. Receiver history holds at
most eight observations; native history holds two, with independent last-known
counters retained to detect resets across missing values. The current timing
bounds are 1.5 seconds for native freshness, 750 ms for receiver report/progress
freshness, and at least 200 ms of receiver-local and parent-observed warmup.
These are conservative admission bounds, not a perceptual quality floor.

Outside an issued engineering operation, arbitrary cadence changes invalidate
the binding. An issued operation admits only its explicit baseline/target
transitions and must return to baseline observations before new drafts.

Peer retirement, worker failure, stopped main-loop lease, generation or offer
replacement, and scope closure invalidate old receiver handles and drafts. A
replacement needs a new receiver handle and fresh proof while retaining the same
owner/session ledger path. Child read brackets and receiver elapsed times are
never aligned with the parent's clock; only parent receipt age is compared.

## Draft lifecycle

`prepare(owner, receiver, request_id, target_fps, duration_ns)` requires current
receiver/native readiness and the typed local policy's target, duration and
reduction bounds. It returns an immutable `RequestDraft` containing the typed
`Request`, its hash, exact slot token, offer/settings/policy hashes and parent expiry.
Drafts expire after at most 250 ms, shortened by observation expiry. At most 64
request identities and 16 receiver bindings are retained per scope. Identical
repeated preparation returns the same still-current draft; changed parameters or
receiver identity under the same request ID are rejected. Cloned draft objects
are not issued drafts. Draft flags cannot be constructed as true.

`recheck(owner, draft)` verifies the issued object, current slot/generation,
fresh proof, hashes, expiry and existing ledger again. It remains read-only.
There is no direct `execute()` method on a draft. Explicit synthetic engineering
dispatch, action-time receiver refresh/cancellation, controlled-setting transitions
and failure drills are described in [engineering dispatch](n10-engineering-dispatch.md).
Integrated browser-to-native/desktop acceptance and production qualification
remain open.

Run the software checks from the repository root:

```sh
python3 -m unittest discover -s engine/runtime/tests/python \
  -p test_live_probe_local_owner.py -v
```

The contained native camera test also binds this API to actual x99/Pulse media,
checks native connection state and prepares a non-dispatchable draft. Its declared
receiver observations come from a Gst test receiver, not a browser. It verifies
that disconnect invalidates the old draft and reconnect uses a new receiver
handle with the same ledger directory. See the [peer-worker procedure](n10-peer-workers.md)
for native prerequisites and isolation bounds.

[Scoped browser receiver observations](n10-browser-observations.md) describes
the default-off authenticated relay/collector and local owner attachment. It
keeps browser data declared and does not enable production probe dispatch.

The read-only inspection also exposes `continuity_ready`. This retains native
connection, counter-progress and browser-freshness checks while a completed
operation's two-snapshot cache transitions back to baseline cadence. It does not
authorize preparation or dispatch. Admission still requires both retained native
samples to match the baseline once no operation is active. A restored acquisition
window requires that strict admission readiness as well as verified restoration
and fresh stable cadence snapshots.
