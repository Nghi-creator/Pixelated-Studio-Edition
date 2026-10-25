# Isolated capture-cadence experiment

`engine/runtime/live_probe_cadence_trial.py` tests live framerate renegotiation in
a disposable pipeline. A named `capsfilter.caps` changes capture cadence from
30 → 15 → 30 frames/s at fixed 640×360. This requests a source capture-rate change;
it does not insert a sleep, drop frames downstream with `videorate`, switch a
profile or restart the pipeline. All bitrate/encoder settings remain fixed.

The four explicit protocols are:

| Argument | Owned source | During cadence |
| --- | --- | --- |
| `--isolated-cadence-trial` | `videotestsrc` | 15 fps |
| `--isolated-cadence-sham` | `videotestsrc` | unchanged 30 fps |
| `--isolated-x11-cadence-trial` | `ximagesrc` on a new private Xvfb display | 15 fps |
| `--isolated-x11-cadence-sham` | `ximagesrc` on a new private Xvfb display | unchanged 30 fps |

The X11 protocols initialize Xlib threading before Gst threads, start their own
Xvfb with `-displayfd`, and obtain the allocated display through the child pipe.
They never select an existing display. X11 capture uses the private server's
static initial screen with damage suppression disabled; no game, user display,
input device or live peer is accessed. This tests capture cadence, not a moving
game workload or visual quality. Xvfb is reaped on exit.

## Fixed measurement and screens

After two seconds of startup, each of baseline/during/restoration excludes two
seconds of settling and measures four seconds. Capture source buffers are capped
at 900, the control loop at 25 seconds and collected decoded
samples at 1,200. An independent host timeout and container cleanup are required.
These are experiment bounds, not qualified gameplay safety limits.

Predeclared inclusive screens require capture, encoded and decoded frame-counter
rates within ±10% of the requested cadence in every phase, including restored
30 fps. Comparisons use exact integer count/time cross-products. Source negotiated
caps and configured caps must agree with the requested rate and unchanged size.
Bitrate and the existing closed encoder-setting inventory must stay unchanged.

The decoder terminates in an appsink with a bounded 60-buffer queue. The control
loop pulls at most eight samples per 50 ms poll outside media callbacks, recording
buffer PTS and monotonic observation time without mapping/copying pixel data.
Across the full trial, including transitions and settling, decoded PTS must
strictly increase with gaps no greater than 250 ms; observed pull times must not
reverse or gap by more than 500 ms. This tests local media timestamps and the
experiment's polling continuity, not actual presentation or WebRTC receiver
continuity. Raw timestamps remain visible, including failed screens.

`assessment.status=met` means only those local screens passed. Reports always
retain `live_authority=false`, no selected family, `unavailable_unverified` live
relief and `not_tested_no_webrtc_receiver`. A returned caps setter or getter does
not establish source cadence; independent counters are required. Failed screens
remain observed results rather than being erased or converted into a pass.

## Containment and use

Use the pinned cached-image containment procedure from the
[bitrate experiment](n10-bitrate-feasibility.md): no network/devices, read-only
filesystem, dropped capabilities, bounded CPU/memory/PIDs, writable temporary
plugin cache, and force-removal of the exact owned container in `finally`.
Use the selected cadence argument and an outer **40-second timeout**. Both runtime
Dockerfiles ship `/app/live_probe_cadence_trial.py` and its helper
`/app/live_probe_trial.py`. Older images need a rebuild or read-only mounts of
both files in the same directory. Retain stdout and host timeout/exit/cleanup
receipts under gitignored `local/`, including partial outcomes.

Unexpected arguments return 2 before loading Gst/Xlib. Missing runtime support or
failed/partial execution returns 1 with unavailable JSON where possible. A fully
observed run returns 0, including a failed local screen; it never means qualified
live relief. Native errors/paths/display identity are not serialized. A hung native
call or SIGKILL can prevent JSON/in-process restoration; the external container
boundary must remove the owned process tree. Cleanup resets only this disposable
caps filter and tears down the pipeline to NULL, retaining failed/unknown cleanup.

The [capsfilter documentation](https://gstreamer.freedesktop.org/documentation/coreelements/capsfilter.html)
defines immediate caps filtering. The [ximagesrc documentation](https://gstreamer.freedesktop.org/documentation/ximagesrc/index.html)
describes framerate negotiation and Xlib threading requirements. Neither is proof
that a particular running camera, encoder or receiver supports safe renegotiation.

This controller is not installed in the camera's normal pipeline. Production
ownership, durable intent, watchdog, budgets, quality costs, real receiver
continuity and failure/restart/restoration acceptance remain separate gates. The
core's `live-probe-evidence-v1` supports only unqualified bitrate declarations;
cadence operator JSON is not silently converted into that frozen contract.

Run boundary tests without Gst:

```sh
cd engine/runtime
python3 -m unittest discover -s tests/python -p 'test_live_probe_*.py' -v
```

The [default-disabled lifecycle kernel](n10-cadence-controller.md) supplies local
request/ownership/journal/watchdog behavior for the next implementation stage.
It requires a dedicated worker and independent receiver port; it does not enable
the camera or promote this experiment to a qualified capability.
