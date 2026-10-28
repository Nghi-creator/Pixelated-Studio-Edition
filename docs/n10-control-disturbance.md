# Integrated synthetic controller disturbance screen

This opt-in engineering screen measures the existing dedicated-worker cadence
controller through the actual camera, authenticated signaling, local owner and
browser observation path. Its source is the isolated synthetic ball/silence
backend. Production/game capture continues to reject controller dispatch.

Build the engine and use the immutable ID of an already cached compatible native
image, as described in [browser/native acceptance](n10-browser-native-acceptance.md):

```sh
npm run build:engine
npm run smoke:n10-browser-native -w @pixelated/engine-runtime -- \
  --image "$N10_NATIVE_IMAGE" --mode engineering-disturbance
```

Save the emitted JSON to a new file in ignored `local/`. Inspect it offline:

```sh
PYTHONPATH=engine/runtime python3 -m live_probe_control.control_disturbance_screen \
  "$N10_CONTROL_RECEIPT"
```

The method is `n10-integrated-control-disturbance-v1`; its role is
`integrated_synthetic_control_disturbance_not_qualification`. Both 640×480 peers
must establish fresh native observations and actual local-owner receiver readiness
within eight seconds, followed by a fixed three-second warmup. Readiness loss
fails the warmup. Three windows measure baseline, active cadence and restoration.
Each records two seconds of browser quality and at least 2.5 seconds of native
process/source observations, on separate clocks. The ordinary observer cost
screen retains its original four-second/4.5-second windows and 30 FPS limits.

After baseline, exactly one local request changes the first peer from 30 to
24 FPS for five seconds, within the existing request/policy maximum. The second
peer remains at 30 FPS. Dispatch retries retain the same operation. Active
configured and negotiated cadence must appear within the bounded two-second
settling stage and remain stable for 500 ms before measurement. Early completion
inside that window fails. Restoration must complete through the controller's
independent port proof, with a clean journal, one retained action and seven
seconds of reserved budget (five seconds plus the existing grace reservation).
After that result, both peers must supply newer native snapshot sequences and
show 30 FPS within one second. Cached pre-restoration samples do not start the
settling interval. Another fixed 500 ms of stable 30 FPS then precedes restored
measurement; target loss during that interval remains a failure.

The offline screen requires the same worker generations/offers through all phases,
unchanged balanced-profile bitrate/CPU/quantizer settings, advancing native source
counters, and the intended configured/negotiated rates. Each viewer must retain
90–110% of its expected decoded/presented FPS, unchanged 640×480 dimensions,
nonblank/variable visual samples, no new drops/freezes, and presentation/media-time
gaps no larger than 250 ms. The sibling and both restored windows require 30 FPS.

A bounded continuous browser frame trace starts before baseline sampling and
covers active and restoration settling periods as well as measured windows.
Its counters must cover each phase's frame counters; gaps between windows cannot
hide a setter-induced stall. Cumulative drop/freeze/decode counters are also
checked across phase boundaries. Trace collection is diagnostic overhead in all
phases; no per-frame Python or filesystem observer is added.

Resource observations are descriptive, separately clocked process CPU and sampled
RSS. This screen introduces no CPU-effect or benefit threshold. A `met` result is
only an integrated synthetic temporal/isolation screen. It does not qualify real
game capture, perceptual fidelity, audio quality, desktop playability, diagnostic
value or a production relief family. Live authority remains false. Acquisition
failures and unknown cleanup remain unavailable; retain them without replacement.
The usual contained runtime limits, 26-second scenario and 42-second outer
container deadlines, exact-worker watchdogs and owned cleanup still apply.
