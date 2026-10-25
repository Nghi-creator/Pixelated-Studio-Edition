# Dedicated peer-worker transport

`engine/runtime/live_probe_control/peer_supervisor.py` provides an opt-in Linux
boundary for one WebRTC answerer pipeline per child. It is import-safe and is
currently independent of the production `camera.py` routing. Normal engine
startup does not activate it. Both `live_authority` and `mutation_available`
remain false; the private protocol contains no cadence setter or live-probe
request.

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

Commands are limited to bootstrap, one SDP offer, ICE candidates and shutdown.
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
source and silent audio. Only the contained synthetic path is covered by the
peer-isolation test. Production capture/audio, browser lifecycle, camera routing,
trace integration and trusted local probe binding remain separate integration work.

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
