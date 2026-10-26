# Scoped browser receiver observations

The optional receiver-observation path binds declared browser playback counters
to one authenticated browser socket, SDP offer, camera connection and dedicated
worker generation. It is read-only. Browser messages contain no cadence request,
policy, budget directory or owner capability. Production probe dispatch remains
unavailable, including when valid browser observations are present.

Enable observations in the host engine environment before camera launch:

```sh
PIXELATED_DEDICATED_PEER_WORKERS=1
PIXELATED_RECEIVER_OBSERVATIONS=1
```

The observation flag defaults to `0`, accepts only `0`/`1`, and requires dedicated
workers. Existing N4/N5 incompatibilities of that worker option still apply.
Without a camera challenge, the browser installs no observation polling or frame
callbacks. No observation history is persisted or added to exported evidence.

## Authenticated relay and challenge lifecycle

After answering a worker's offer, the camera issues `webrtc-receiver-bind` with
`peerId`, a fresh opaque 256-bit `bindingId`, and the SHA-256 of the exact emitted
SDP offer. The Node relay accepts challenges only from its trusted camera role
in the active session. It compares the hash with the offer registered for the
peer and sends the challenge only to the owning socket, not the session room.
It also rechecks current stream/lobby permission before delivery.

The relay acknowledges `webrtc-receiver-bound` to that camera, adding the actual
`receiverSocketId`. Browser `webrtc-receiver-observation` reports may contain only
`peerId`, `bindingId`, `clockId`, `sequence`, `elapsedNs`, `framesDecoded` and
`presentedFrames`. All counters are bounded safe integers. The relay verifies
peer ownership, active session, challenge, sequence, clock identity, counter
monotonicity and current lobby permission. It rechecks the destination camera's
live role/session and stamps the authenticated socket identity and offer hash
itself. A browser cannot supply those trusted envelope fields or forward a
report for another peer. Only the issuing camera receives observations.

One binding is stored per admitted peer, within existing peer capacity. Reports
share the signaling event budget and cannot be forwarded less than 100 ms apart.
Replays, sequence/counter reversal, clock replacement and flooding invalidate the
binding. Identical challenge retries do not reset sequences. Changed offers,
new challenges, owner disconnect/session changes and camera disconnect revoke old
bindings. Camera disconnect also sends `webrtc-receiver-unbind` to stop its
collectors. There is no observer-to-controller command or remote recovery method.

Authentication identifies the sender and connection scope. It does not prove
that browser-reported counters are truthful or that perceived quality is good.
Receipts retain the declared-counter basis and cannot grant live authority.

## Browser collection

The player passes its actual video-element ref to the WebRTC lifecycle. A valid
challenge must match the active peer and the hash of the original offer cached
before transmission; later ICE additions to `localDescription.sdp` do not change
that binding. Collector lifetime is tied to that exact peer connection, stream,
video element and challenge generation.

Collection requires a secure browser context (localhost is sufficient), Web
Crypto, `requestVideoFrameCallback`, and matching inbound RTP stats. It pairs
presented-frame callbacks with `framesDecoded` from exactly one live video
receiver/track and a stable stats ID/SSRC. It does not merge epochs or fall back
to guessed zero counters. Connected state can precede the first inbound stats
record; initial missing stats are awaited for at most five seconds. Missing data
after an established stats epoch, reset counters/identity, failed state or invalid
time ends collection.

The collector queries stats about every 200 ms with at most one query in flight.
A query taking more than 500 ms cannot emit its result as fresh data. No report
is sent before an actual presentation callback. Frozen counters can be reported
but cannot sustain downstream progress readiness. Disposal, disconnect, unbind
and replacement cancel timers/frame callbacks; late asynchronous hash/stats
completion cannot restart an old collector or emit for a new peer.

These are presentation and decode proxies, not photon timing, an authenticated
measurement of visual quality, or a qualified relief capability. Background or
unsupported browsers may provide no usable observations; native health checks
and local-owner readiness must remain conservative in those contexts.

## Camera and local owner binding

`BrowserReceiverBridge` checks the acknowledged socket ID, nonce, exact offer and
current slot/token/generation before accepting reports. Socket callbacks stamp
host monotonic receipt time before GLib queueing and capture the current peer and
signaling epoch. Queued callbacks for a retired peer or old camera connection are
ignored. Main-loop backlog older than the receiver freshness bound invalidates
the observation instead of assigning a fresh processing timestamp.

A trusted local host caller may call:

```python
receiver = bridge.attach(local_owner, owner_capability, peer_id, worker_token)
```

The local owner must refer to the same camera service and exact playing worker.
The returned receiver capability is process-local and never transmitted to the
browser. Buffered reports are not replayed into the new scope. Only subsequent
fresh reports establish warmup; their sequence is rebased for that local scope
without changing browser or host time. `LocalProbeOwner.report_at` preserves the
original host receipt stamp, and native snapshot validation fences its atomic
read before comparing the parent clock to avoid concurrent-publication races.

Retirement/replacement, invalid observations or a changed socket invalidate the
attached receiver capability and request cancellation of any issued engineering
operation. Re-arming requires a fresh challenge/binding and fresh proof; it does
not reset the owner/session journal. The bridge does not construct an owner,
select a policy/directory, prepare a draft or dispatch an action. See
[local admission](n10-local-owner.md) and [engineering dispatch](n10-engineering-dispatch.md).

## Verification and limits

Run the normal engine/web tests for relay validation, scoped collector cleanup
and camera/owner binding. An explicit real Chromium/loopback Socket.IO smoke test
is available after building the engine:

```sh
npm run build:engine
node engine/runtime/scripts/n10/browserReceiverSmoke.mjs
```

It uses the installed Playwright Chromium, disposable pairing credentials, an
ephemeral loopback server and browser-to-browser canvas WebRTC media. It checks
actual frame callbacks/stats through the authenticated relay, foreign-socket
rejection, challenge replacement and stop-on-camera-disconnect. The actual
browser error handler must preserve playback and advancing observation counters
when a sibling fails or another browser forges a shared error. A matching peer
failure must still reach the viewer's fatal-error callback. The test closes all
owned resources. No hosted service, engine game, real pairing token or probe
mutation is used. It requires the workspace's development dependencies and
Playwright browser cache; it does not download a browser.

The [browser/native acceptance runner](n10-browser-native-acceptance.md) joins
the actual camera, relay, browser collector and local owner in one contained
session, including synthetic action completion and receiver-loss teardown.
The [read-only observer disturbance screen](n10-observer-disturbance.md) provides
fixed matched off/on temporal and resource checks. Desktop acceptance, control
action disturbance, perceptual quality and production qualification remain
separate requirements. N10 stays open.
