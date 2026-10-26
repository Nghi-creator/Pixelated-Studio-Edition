# Browser/native worker acceptance

The opt-in acceptance runner connects real Chromium video playback to the
production Socket.IO auth, lobby, signaling and error handlers, the actual
`camera.py` Socket.IO callbacks/GLib loop, `BrowserReceiverBridge`, local-owner
admission and dedicated Linux Gst worker processes. It owns a private display,
fixed Frozen-Bubble game and Pulse null-sink monitor. It never attaches to a
running desktop session or uses a saved pairing token.

## Run

Use a cached native Linux image containing Node, Socket.IO, Python/GI, Gst
WebRTC/VP8/Opus, pidfds, Xvfb, Frozen-Bubble, XTest and PulseAudio. Set
`N10_NATIVE_IMAGE` to its immutable `sha256:` image ID. The host needs Docker,
the workspace development dependencies and the installed Playwright Chromium.
The runner neither pulls/builds an image nor downloads a browser.

From the repository root:

```sh
npm run build:engine
npm run smoke:n10-browser-native -w @pixelated/engine-runtime -- \
  --image "$N10_NATIVE_IMAGE"
```

The default `all` mode runs three independent disposable sessions in sequence.
For a single scenario append `--mode production-admission`,
`--mode engineering-complete` or `--mode engineering-receiver-loss`.
Any failed assertion, deadline, process exit or unconfirmed cleanup fails the
command. Successful JSON output is an engineering test receipt, not a public
probe evidence bundle or qualification result. Keep session receipts in ignored
`local/` if retaining them.

The server publishes one ephemeral **loopback-only** host port. A Docker bridge
allows the real host-browser/container ICE exchange; there is no external
STUN/TURN configuration. The browser aborts non-test-origin HTTP requests.
Container source mounts are read-only and limited to required code/assets.
Capabilities are dropped, privilege escalation is disabled, and each container
has 2 CPUs, 768 MiB memory, 256 PIDs, temporary writable caches and a 42-second
outer lifetime. The camera scenario has a fixed 26-second deadline. The game,
workers, guards, signaling server, browser and temporary files are owned and
cleaned up by the run. Blocked local ICE fails rather than substituting media or
relaxing readiness thresholds.

## Scenarios and assertions

All scenarios use two real browser receivers, the actual app observation
collector and browser fatal-error handler. Browser decode/presentation counters
are forwarded through authenticated peer/offer/nonce bindings; camera receipts
retain their original host timestamp before GLib queueing. Local admission needs
fresh native source/connection progress and fresh browser progress.

- **Production admission:** actual x99 capture and Pulse monitor. The local owner
  prepares a dry-run request, rejects controller dispatch for the production
  source, and creates no action journal. Killing the exact first worker must
  fail only its viewer. That viewer creates a new peer/worker/binding and passes
  fresh admission; the retired receiver capability and request are rejected.
  The sibling viewer, source counters and separately owned game keep progressing.
- **Engineering completion:** only the contained test host explicitly selects
  `isolated_synthetic` and opens an `EngineeringControl` for its private ledger.
  The local API dispatches one 30-to-24 FPS action. A repeated dispatch returns
  the same handle. Completion requires `verified_by_port` restoration and a clean
  journal. A subsequent worker kill/replacement must retain the action count and
  full duration-plus-restoration-grace reservation.
- **Engineering receiver loss:** after native target cadence is observed, the
  host stops the first browser's observation collector. Actual video must still
  advance, distinguishing report loss from an already dead stream. The action
  must abort with restoration `unknown`, retain dirty intent/full reservation and
  tear down only its exact worker. A replacement may establish read-only
  admission but cannot prepare another action through the dirty ledger. The
  sibling and game continue progressing.

Each session ends by disconnecting the actual camera signaling connection.
Captured live workers must complete bounded graceful cleanup with exit code zero;
the previously failed worker must also be reaped. Camera unbind notifications
must stop both active browser collectors, and late callbacks cannot resume their
report sequences.

## Test boundary and remaining qualification

`nativeBrowserRelay.cjs` is a disposable server assembled from production
handlers, with a fixed test session and ephemeral pairing credential; it does
not launch the desktop UI or full application server. The Python host executes
actual `camera.py` and captures references to its constructed worker/bridge/client
objects to call trusted local APIs and inject exact-lifetime failures. It does
not replace network signaling, native pipelines, browser counters or readiness
checks. Engineering configuration is injected only inside this explicit test
host; no controller or failure-injection endpoint is exposed to a browser.

This verifies integrated admission, action lifecycle, failure isolation,
replacement, durable blocking and teardown. Browser counters remain declared
observations, and `live_authority` stays false. It does not establish perceptual
quality, acceptable disturbance/resource overhead, supported-device coverage or
live relief-family qualification. Full desktop gameplay/audio/UI acceptance and
production-path qualification remain separate requirements. Production probe
dispatch stays unavailable and N10 remains open until its qualification gates
are satisfied.
