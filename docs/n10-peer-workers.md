# Dedicated peer-worker transport

`engine/runtime/live_probe_control/peer_supervisor.py` provides an opt-in Linux
boundary for one WebRTC answerer pipeline per child. It is import-safe and is
connected to `camera.py` behind `PIXELATED_DEDICATED_PEER_WORKERS=1`. Normal
engine startup does not activate it. Both `live_authority` and `mutation_available`
remain false. Default transport exposes no probe dispatch; the separate
[synthetic engineering controller](n10-engineering-dispatch.md) requires explicit
local configuration and cannot be enabled for production capture.

## Ownership and lifetime

An owner must enter a `PeerSupervisor(enabled=True)` context and call `poll()`
frequently on its control thread. Polling is never a media callback operation.
The supervisor creates its own generation aliases, starts a dedicated child,
opens that unreaped child's Linux pidfd, then arms an independent lifetime guard
before sending bootstrap data. Platforms without pidfd support refuse startup.

The guard receives only the exact child pidfd and private lease descriptors.
Parent pipe closure, invalid heartbeat data, or three seconds without a heartbeat
kills that child. Parent polling sends heartbeats every half second. Explicit
cleanup also uses the owned pidfd, bounds TERM/KILL waits, and reaps the worker
and guard. No persisted PID, process-name lookup, process-group kill, game handle,
or sibling-peer handle selects a termination target.

The context owns all cleanup even after protocol errors, media failure, worker
exit, and startup failure. `shutdown()` requests a native NULL transition. A
successful graceful result requires `null_observed`, complete protocol frames,
and actual exit code zero; an acknowledgement alone is insufficient. Process
termination is teardown, not verified live restoration.

## Private protocol

`peer_protocol.py` defines newline-delimited JSON on inherited stdin/stdout
pipes. There is no listening socket. Closed message shapes, exact integer types,
UTF-8 byte bounds, duplicate-key rejection, generation aliases, ordered command
sequences, and request hashes bind responses to their requests. These hashes
provide correlation, not authentication of an external sender.

Default commands are bootstrap, one SDP offer, ICE candidates and shutdown.
Private IPC v3 additionally supports closed engineering probe/receiver/cancel
commands only with explicit synthetic configuration; it has no generic setter.
A repeated identical offer reuses its existing request; a changed offer requires
a fresh worker generation. Bootstrap accepts only the three existing encoder
profiles, bounded FPS/bitrate, validated ICE data, and a fixed source selector.
It never accepts pipeline expressions or executable commands. SDP is limited
to 64 KiB, candidates to 4 KiB, frames to 256 KiB and buffered protocol data to
512 KiB. Command count, outstanding requests, ICE candidates, output queues,
stderr volume and reply deadlines are also bounded. Gst's empty end-of-gathering
markers are omitted rather than forwarded as candidates.

Engine signaling credentials stay in the parent. The child's inherited environment
uses an allowlist, and validated ICE configuration is passed through the private
pipe. Configuration logging is suppressed on protocol stdout. This is a lifetime
and media ownership boundary, not an operating-system security sandbox.

Snapshots contain child-local read brackets, media state, capture/encode counters,
queue levels/overruns, dimensions, cadence and encoder settings. Unavailable native
values remain null. Snapshot time must advance; three seconds without a snapshot
in ready/playing state fails the transport. Child clocks are not parent trace
clocks, and these snapshots do not establish receiver health or probe qualification.

## Media and verification

The worker builds fixed VP8 video and Opus audio branches. `production` selects
`:99` X capture and `auto_null.monitor`; `isolated_synthetic` selects a ball test
source and silent audio. The peer-isolation test uses synthetic media; the
camera adapter test uses private x99 capture and a PulseAudio null-sink monitor.
Scoped browser observations and local engineering dispatch are documented
separately. Integrated browser/native lifecycle acceptance, child trace exports
and production qualification remain open.

Run protocol/supervisor tests without Gst from the repository root:

```sh
python3 -m unittest discover -s engine/runtime/tests/python \
  -p 'test_live_probe_peer*.py' -v
```

Inside the disposable Linux native runtime, from `engine/runtime`, opt into:

```sh
N10_NATIVE_PEER_TESTS=1 python3 -m unittest discover \
  -s tests/python -p 'test_live_probe_peer*.py' -v
```

The native tests require Gst WebRTC/VP8/Opus, pidfds, Xvfb, Frozen-Bubble and XTest.
Use an internal-only container network with no external STUN/TURN, read-only source
mounts, bounded CPU/memory/PIDs, writable temporary caches and an outer deadline.
The test owns a private display/game and two receiving peers, requires decoded
video/audio progress, kills one exact worker, and requires continued decoding by
the other peer and continued game CPU progress. It also checks graceful NULL/exit
cleanup and lease loss/stall targeting. It never attaches to a user's game/display.

## Opt-in camera routing

Set `PIXELATED_DEDICATED_PEER_WORKERS=1` in the host engine environment before
launching the camera. The existing camera launcher inherits this host setting;
WebRTC messages and guests cannot select the backend. The flag accepts only
`0` and `1`, defaults to `0`, and currently routes all camera peers through the
worker backend when enabled. Native runtime dependencies and Linux pidfds are
required. Invalid worker configuration fails rather than falling back silently.
This enables media transport only; it does not authorize live cadence changes.

N4 stage tracing and N5 campaign configuration are explicitly incompatible with
this option. Startup rejects those combinations before signaling connects.
Experiment recording control also rejects dedicated peers. Child trace export
is not implemented, and child snapshot brackets are never merged into the parent
trace or written to its export path. Leave the worker option disabled for N4/N5.

`camera_workers.py` owns one control thread per admitted peer. GLib/signaling
callbacks only enqueue work, consume bounded results, or retire a slot. Child
startup, negotiation and teardown waits run on the slot's control thread. The
existing peer limit includes retired workers until cleanup completes, preventing
rapid reconnects from accumulating unbounded threads/processes. An identical
offer is ignored; a changed offer requires disconnect/replacement. Replacement
uses a fresh worker generation and parent token; stale results and callbacks
captured for the old peer cannot update or close its replacement. ICE queued
while a worker starts is bounded and forwarded after bootstrap. Network ICE
still relies on the negotiated SDP credentials; no probe authority is derived
from signaling messages.

Each GLib poll renews a three-second adapter lease. A stalled main loop cannot
keep workers alive merely because their background threads continue polling.
Candidate/result queue overflow or worker failure closes that slot. A worker
failure reports a structured `engine-error` with its `peerId` and removes only
that peer; it does not terminate the camera process or the separately owned game.
Only the trusted camera in its active session may relay engine errors. A scoped
error goes only to the peer's room; an invalid explicit peer/session scope is
dropped. Session-wide camera failures and server-issued access revocation retain
their shared scope. The browser ignores other-peer errors and disposed lifetimes.

Signaling disconnect retires the captured worker peers and invalidates queued
offers using a connection epoch. Early ICE/disconnect callbacks bind either the
current peer object or an exact bounded pending-offer identity. Candidates for a
queued offer remain usable after startup; callbacks received without an owning
offer cannot affect a later peer. Retired legacy pipeline bus errors are ignored.
Peer disconnect queued before offer startup is also honored. Camera SIGTERM/SIGINT and process-manager stream
restart use bounded worker cleanup; abrupt parent death also closes private
lease pipes. The adapter adds no mutation endpoint or browser-side control.

Encoder telemetry retains schema version 1. Worker values come from native
snapshots, with parent receipt-time freshness. Missing, future-dated, stale or
unavailable snapshots yield null metrics. An aggregate requires known values
from every active peer; mixed encoder settings remain null. Native queue getter
failures also remain null on the legacy path. Empty-peer counters remain zero.
No missing queue or worker counter is represented as healthy zero occupancy.

Software adapter/callback/telemetry tests run with:

```sh
python3 -m unittest discover -s engine/runtime/tests/python \
  -p 'test_live_probe_camera*.py' -v
```

Inside the contained native runtime, run the same pattern from `engine/runtime`
with `N10_NATIVE_PEER_TESTS=1` and `-s tests/python`. The native test executes the
actual camera callback bodies, production x99/Pulse branches and dedicated worker
processes. It verifies two receiving peers, disconnect/replacement, stale result
isolation, worker-crash isolation, signaling disconnect, observed NULL/zero exit
and continued game lifetime. It uses an in-process signaling harness, so it does not replace a full
Socket.IO/browser/desktop gameplay acceptance run.

[Read-only local probe admission](n10-local-owner.md) binds process-local owner
requests and declared receiver progress to native worker observations. It uses
private IPC v3 connection-state snapshots and atomic parent observation sequences.
Its drafts remain read-only; engineering dispatch is separately gated and does
not grant live mutation authority.

[Scoped browser receiver observations](n10-browser-observations.md) describes
the default-off authenticated relay/collector and local owner attachment. It
keeps browser data declared and does not enable production probe dispatch.
