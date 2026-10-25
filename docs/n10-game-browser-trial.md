# Contained game and browser cadence experiment

`engine/runtime/scripts/n10/gameBrowserTrial.mjs` runs a fixed, disposable Linux
Frozen-Bubble level through an owned Gst WebRTC sender and a separate headless
Chromium video receiver. It exercises the [cadence controller](n10-cadence-controller.md)
without attaching to `camera.py`, an existing game session, a user's browser
profile or any hosted service. Importing the Python/JavaScript helpers starts no
browser, game, pipeline or control action. Live authority remains unavailable.

## Requirements and explicit launch

Use the repository's installed development dependencies and Playwright Chromium,
a running Docker engine, and an exact trusted **locally available** native runtime
image SHA-256 ID containing the locked Frozen-Bubble package, Xvfb, Gst Python
bindings and libXtst. No image is pulled or rebuilt by this runner. It mounts the
current controller package and shared journal helper read-only, so retain the
source hashes in each acquisition even when the image/revision is unchanged.

From the repository root, set `N10_IMAGE_SHA` to the verified local image ID and
create a new private state directory for this independent experiment:

```sh
mkdir -m 700 local/phase_2/game-browser-state
node engine/runtime/scripts/n10/gameBrowserTrial.mjs \
  --mode changed --image "$N10_IMAGE_SHA" \
  --state-directory local/phase_2/game-browser-state \
  --output local/phase_2/game-browser-acquisition.json
```

The parent output directory must exist. Output and its optional `.png` receiver
image use exclusive creation and private permissions; existing files are not
replaced. The state directory must be a new, empty, owner-only mode-0700 directory.
Retain it after failure; do not delete a dirty journal to reset budgets. Use new
state directories only for independently disposable experiments, not to retry
control on the same live lifetime. The runner never commits or publishes results.

Modes are closed to:

- `changed`: one 30→24→30 fps request with durable intent and independent watchdog.
- `sham`: unchanged 30 fps measurements on an independently fresh game/browser;
  no setter, controller request or budget reservation is fabricated.
- `cancel`: cancellation after one second, followed by owned restoration proof.
- `disconnect`: deliberate receiver closure after one second. Unknown restoration
  leaves dirty intent; the worker waits for its pidfd watchdog to terminate it.
  Exit 137, unavailable evidence and a dirty ledger are expected for this drill.

Missing tools, unsupported runtime behavior, failed screens and partial outcomes
remain failures or missing observations. There is no simulated acknowledgement or
fallback source. The contained Python entry point accepts only the fixed
experiment/mode/state-directory arguments. It is a dedicated process, never an
in-process camera/server hook or a new LAN mutation endpoint.

## Fixed context and containment

The game is `/usr/games/frozen-bubble --fullscreen --solo --level 1 --no-sound
--no-music --private`. It owns a fresh Xvfb display selected through `-displayfd`,
with a 640×480 screen. Xlib threading initializes before Gst threads. A bounded
script sends only Up/Left/Up/Right pulses to that exact private display, beginning
after game load. No host desktop input or caller-selected display/device/game is
accepted. The game/display process handles are retained and reaped at teardown;
failed key release does not skip child-process cleanup.

The sender uses `ximagesrc`, source caps control, I420 and software VP8 at 1 Mbps,
with fixed encoder settings. There is no video-rate dropper, sleep insertion,
profile change or pipeline restart. The three-second request reduces source FPS
from 30 to 24, with 500 ms application settling. Restore proof excludes 200 ms,
then measures 750 ms of fresh source/browser output within the five-second
reserved watchdog lifetime. These are provisional engineering parameters, not a
production safety/quality policy.

Docker uses a read-only filesystem, dropped capabilities, no-new-privileges,
a two-CPU/768 MiB/128-PID limit and bounded temporary filesystems. Python bytecode caches are directed to temporary storage rather than mounted
source caches. Its original container home is temporary; no host home/profile is mounted. All descendants
belong to the exact created container, which is force-removed in parent cleanup.
Native execution has a 35-second outer limit and the parent exchange a 40-second
limit. The independent control watchdog remains necessary for blocked setters or
failed restoration; outer teardown cannot be labeled verified live rollback.

Signaling travels only through bounded private stdin/stdout messages. The Docker
bridge permits ICE between the contained sender and the owned host Chromium;
no ports are published and no STUN/TURN or external signaling service is used.
Chromium runs a fresh `about:blank` page with HTTP requests blocked. The local-IP
mDNS option applies only to that disposable browser process. SDP, candidates,
addresses and browser process IDs are exchanged transiently, not serialized into
the acquisition. Native stderr is bounded and hashed rather than copied into
reports. There are no service credentials or user browser storage in this flow.

## Health, evidence and interpretation

Before control, health requires fresh browser presentation, a connected sender
and receiver, exact dimensions, available browser statistics with zero dropped
frames/freezes, and a nonblank received-image sample. The controller polls health
outside media callbacks. Unsupported/malformed/duplicate/oversized signaling,
peer replacement, changed presentation lifetime, pipeline ERROR/EOS, game/display
exit or lost control pipe invalidates the owned worker. Incomplete recovery keeps
the guard armed. Browser messages, queues, timelines, sample arrays and game
inputs are bounded.

The acquisition retains the actual source hashes, image/browser version, phase
windows, setter brackets, exact configured/negotiated source rates, presentation
callbacks and browser RTP/decode/freeze counters. It retains startup samples too.
Scene screens apply only to the declared measured windows after warm-up: at
least one sample per window, at least three distinct received image hashes across
those windows and at least four quantized color bins per measured sample. This
checks variation/nonblank output, **not** source-frame identity or perceptual
fidelity. The optional PNG helps an operator inspect the received game state.
A headless video element does not establish full desktop UI/playability acceptance.

Source/presentation rate screens use inclusive ±10% integer arithmetic; PTS gaps
are limited to 250 ms and presentation/worker receipt gaps to 500 ms. Browser
`requestVideoFrameCallback`, `getStats` and low-resolution canvas sampling are
explicit instrumentation. The game-to-browser path is distinct from the earlier
synthetic Gst-to-Gst experiment. It must not be imported or relabeled as that
frozen `cadence-probe-evidence-v1` report scope or the bitrate-only evidence root.
Core provides a separate [game/browser engineering evidence contract](../../latency_fingerprinting/docs/live_probes/N10_GAME_BROWSER_EVIDENCE.md)
with protected import and independent inspection for these acquisitions.

For offline descriptive summaries:

```sh
cd engine/runtime
python3 -m live_probe_control.game_browser_summary \
  ../../local/phase_2/game-browser-acquisition.json
```

The summary recomputes transport/temporal screens, brackets worker CPU and exact
owned-game CPU/RSS observations per phase, and retains browser counter subintervals.
Worker/game CPU percentages use their Linux worker clock; browser CPU uses its
separate host clock and the current owned Chromium process inventory. A changed
inventory, reset/missing counter or missing phase stays unknown rather than
becoming zero cost. These CPU scopes are not combined or clock-aligned. Browser
stat/visual samples are assigned by worker receipt times, not by an invented
browser-to-source clock mapping. Their original browser timestamps remain visible.

Compare changed requests with unchanged controls, alternate order, predeclare
repetitions/limits and keep every failure. A short engineering CPU ratio is not
causal/diagnostic benefit or release qualification. Frames are not independent
runs. Perceptual image quality, other games/profiles, audio, interactive controls,
reconnect, actual desktop/browser flows and a production worker binding remain
separate acceptance requirements. The acquisition and summary always state
`live_authority=false`, with engineering-only qualification and perceptual quality
`not_evaluated`.

## Software verification

```sh
cd engine/runtime
python3 -m unittest discover -s tests/python -p 'test_live_probe_*.py' -v
node --test scripts/n10/gameBrowserTrial.test.mjs
```

The runtime Node suite also invokes these boundary checks. Real game/browser
experiments are explicit operator runs and are never silently enabled by unit
tests. Both runtime images already copy the Python controller package; the host
browser driver runs from the development checkout and adds no production
Playwright dependency to the runtime image.
