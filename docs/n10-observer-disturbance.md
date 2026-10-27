# Read-only observer disturbance screen

The optional browser observation relay and local-owner admission path have a
separate, fixed engineering cost screen. It compares observer-off with observer-on
using actual production x99/Pulse capture, a private scripted Frozen-Bubble level,
two balanced 640×480/30 FPS VP8 peers, authenticated signaling and fresh Chromium.
There is no cadence action, remote control command or live probe authority.

## Acquisition

Build the engine and set `N10_NATIVE_IMAGE` to the immutable ID of a compatible
cached native image, as described in [browser/native acceptance](n10-browser-native-acceptance.md).
Set `N10_COHORT_OUTPUT` to a new absolute path under ignored `local/`.

```sh
npm run build:engine
npm run smoke:n10-observer-cost -w @pixelated/engine-runtime -- \
  --image "$N10_NATIVE_IMAGE" --output "$N10_COHORT_OUTPUT"
PYTHONPATH=engine/runtime python3 -m live_probe_control.observer_screen \
  "$N10_COHORT_OUTPUT"
```

The order is off/on, on/off, off/on: six independent sessions, with matched pairs
(0,1), (3,2), (4,5), always comparing on minus off. Each session creates its own
game, display, camera, workers, browser, ephemeral credential and private owner
directory. Off uses the dedicated media backend without constructing the browser
bridge or local owner; on enables both and requires fresh local admission before
measurement. Both conditions run the same additional diagnostic samplers.

After both native connections are established, warmup is fixed at three seconds.
Browser measurement lasts four seconds; bracketed native resource sampling lasts
at least 4.5 seconds. The windows use their own clocks and are not aligned or
combined. The runner records the actual image, runtime/compiled relay/collector
source hash, browser version and host platform/architecture. All six runs must
have the same recorded context. Startup, reconnect and controller costs are
outside this steady-state comparison.

The existing contained-runtime resource, deadline, loopback networking and cleanup
bounds apply. Output is created exclusively and checkpointed after every case.
Failed cases remain in order and are not retried or replaced. Unknown cleanup
stops acquisition. A nonzero acquisition exit means the cohort is incomplete or a
case failed; an acquisition success still requires inspecting the offline screen.
Do not run unrelated benchmarks or builds concurrently with acquisition.

## Fixed engineering limits

Each viewer must retain 640×480 video, a connected stream, 27–33 decoded and
presented FPS, no new dropped frames or freezes, no presentation or media-time
gap over 250 ms, and coverage of the measurement-window edges. Samples must show
at least four coarse color bins and three distinct visual hashes. These are
nonblank/temporal proxies; no reference-image fidelity or perceptual quality
assessment is inferred from them.

Each matched pair has these maximum observer-on increases:

| Scope | CPU increase, percentage points of one core | Peak sampled RSS increase |
| --- | ---: | ---: |
| Python camera/owner process | 5 | 8 MiB |
| Node relay process | 5 | 8 MiB |
| Two owned media workers together | 10 | 16 MiB |
| Owned browser process inventory | 10 | Not measured |

These are predeclared engineering budgets, not fitted confidence intervals or
universal safety limits. Every pair and every viewer must pass; averages cannot
hide one failed case. Negative resource differences are retained as measurements,
not proof of a benefit. Pairwise deltas also include remaining content/timing
variation and measurement noise; a breach blocks this screen but does not by
itself establish a causal observer-overhead estimate. Native CPU uses exact owned
process tick deltas and Linux
monotonic read brackets; RSS is the maximum sampled value, not an absolute peak.
The relay is the camera host's direct parent, whose lifetime is pinned for the
measurement. Browser CPU uses host-clock CDP process counters and requires an
unchanged inventory within its own window. Browser and native CPU are reported
separately. Game CPU must advance; Pulse/lease-guard overhead is outside the
reported CPU scopes.

## Results and missingness

The offline method is `n10-observer-disturbance-v1`. `observer_screen` is `met`,
`not_met`, or `unavailable`. The offline command emits its assessment and exits
nonzero unless this narrow screen is `met`; this is not a live-qualification exit
status. Missing/nonfinite/reset counters, changed process
inventory, stale native observations, unknown cleanup, clock/coverage gaps,
incomplete order or a changed software/image/browser context cannot pass.
Native source progress is independently required; a browser claim alone is
insufficient. Real counters and samples are retained for inspection.

`qualification` remains `unavailable_engineering_only`, `perceptual_quality`
remains `not_evaluated`, and `live_authority` remains false even if this screen
passes. Its scope is the read-only observer/admission path in this contained
context. It does not qualify a relief family, controller disturbance, audio
quality, a desktop build, other profiles/devices or held-out diagnostic evidence.
Those require their own production-path qualification and acceptance.

## Same-worker exploratory diagnostic

A separate diagnostic can help distinguish changing source content from observer
activity. It is deliberately excluded from the six-case screen above:

```sh
npm run smoke:n10-browser-native -w @pixelated/engine-runtime -- \
  --image "$N10_NATIVE_IMAGE" --mode observer-static-diagnostic
```

It waits for actual local-owner readiness on both receivers (at most eight
seconds), then applies a fixed three-second warmup. It stops only its own game
through an exact pidfd and holds that framebuffer while two existing workers keep
streaming. Three native 4.5-second/browser four-second windows run in on/off/on
order, with fixed settling periods of 500 ms, 500 ms and 1 s. Eligibility loss,
late rebind readiness or the 30-second scenario deadline fails the diagnostic;
there is no adaptive warmup or retry.

The off interval stops the actual browser collectors through a message emitted
only from the directly owned camera CLI host's stdout into the disposable relay.
No network handler accepts a request to inject that message. The second on
interval obtains new camera challenges and local receiver handles for the same
workers. Each measured window requires unchanged worker/offer identities and
private command counts, advancing source counters, and zero game CPU progress
while stopped. Cleanup resumes the game using that same pidfd before normal
owned-process teardown, including on failed acquisition.

Receipts contain browser startup markers for offer/answer, connection, video track,
first presentation and first report. Native markers record when the host detects
connection, binding, reports and readiness, plus the game age/script position at
freeze. These are two separate clock domains; do not subtract a browser timestamp
from a camera timestamp or treat a polling detection time as an exact capture time.
Structured failure receipts retain collected events and page diagnostics.

Save the emitted JSON under ignored `local/`. Its descriptive summary is:

```sh
PYTHONPATH=engine/runtime python3 -m live_probe_control.observer_diagnostic \
  "$N10_DIAGNOSTIC_OUTPUT"
```

This reports scope-specific resource contrasts and temporal/nonblank continuity,
without requiring visual variation from a deliberately frozen scene. It does not
apply or modify the original cohort's budgets. A static framebuffer, the same
processes and one on/off/on sequence do not qualify moving-gameplay overhead or
identify a general causal effect. Diagnostic state `observed` means the
measurement was available; qualification and live authority remain unavailable.
The ordinary screen rejects diagnostic cases and still requires game progress
and visual variation. Never replace a failed cohort case with this diagnostic.
