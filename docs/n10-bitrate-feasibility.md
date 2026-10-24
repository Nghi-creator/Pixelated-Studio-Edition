# Isolated VP8 bitrate feasibility experiment

`engine/runtime/live_probe_trial.py` explicitly builds a disposable synthetic
640×360/30 VP8 encoder/decoder pipeline. It never attaches to a camera, peer,
device, socket or running gameplay pipeline. Its only varied control is
`vp8enc.target-bitrate`: 1,000,000 → 500,000 → 1,000,000 bits per second.
There is no production live adapter or capability grant.

Use a pinned target image with `videotestsrc`, `vp8enc`, `identity`, `vp8dec` and
`fakesink` installed. Both runtime Dockerfiles package `/app/live_probe_trial.py`;
older images require a rebuild or an explicit read-only file bind mount.
The tool accepts exactly `--isolated-bitrate-trial`; it is never run at startup.

## Run with external containment

Run only in a throwaway container with no network/devices, read-only filesystem,
dropped capabilities, bounded CPU/memory/PIDs and writable temporary plugin cache.
Enforce an outer 30-second timeout and force-remove **that exact owned container**
in `finally`, even after timeout or nonzero exit. The Python polling deadline is
not an independent watchdog for a stuck native setter. This host-side example
uses a locally cached image and requires Python 3 and Docker:

```python
import subprocess
import uuid

name = "n10-isolated-" + uuid.uuid4().hex[:12]
image = "YOUR_PINNED_LOCAL_RUNTIME_IMAGE"
command = [
    "docker", "run", "--rm", "--pull", "never", "--name", name,
    "--network", "none", "--read-only", "--cap-drop", "ALL",
    "--security-opt", "no-new-privileges", "--cpus", "2", "--memory", "512m",
    "--pids-limit", "64", "--tmpfs", "/tmp:rw,nosuid,nodev,noexec,size=16m",
    "--env", "XDG_CACHE_HOME=/tmp/cache", "--entrypoint", "python3", image,
    "/app/live_probe_trial.py", "--isolated-bitrate-trial",
]
try:
    result = subprocess.run(command, capture_output=True, text=True, timeout=30)
    print(result.stdout)  # Retain all partial outcomes, including nonzero exits.
    print("exit:", result.returncode)
finally:
    subprocess.run(["docker", "rm", "--force", name], capture_output=True, timeout=10)
```

No media files are written. JSON is printed to stdout; retain operator receipts
in gitignored `local/`. Missing GI returns unavailable/exit 1; unexpected arguments
return exit 2. A completed observed trial returns 0 even though live relief stays
unavailable. An interrupted, failed or partial trial returns 1 with retained
receipts/windows where available. An externally killed process may have no JSON;
retain the host timeout/exit and container cleanup result separately.

## Measurement and limits

After two seconds of startup, each of baseline/during/restoration excludes one
second of settling and measures two seconds. The source stops after 600 buffers;
the control loop has an 18-second deadline. All durations are experimental bounds,
not validated live safety limits. Short windows do not establish steady-state
rate-control convergence; this experiment sets no output-effect acceptance threshold. Source/scene, resolution, rate-control mode and
unrelated encoder settings remain fixed. Setting observations bracket each window;
setter-call receipts precede mutation and remain incomplete if the setter raises.

[Identity statistics](https://gstreamer.freedesktop.org/documentation/coreelements/identity.html)
provide encoded bytes/buffers independently of the bitrate getter. Decoder output
is counted through [GstBaseSink statistics](https://gstreamer.freedesktop.org/documentation/base/gstbasesink.html).
Read brackets and process-monotonic timestamps remain visible; observations across
elements are not atomic. Output rate uses byte deltas over observation-start
elapsed time and retains the read-bracket uncertainty. Counter regression and
nonpositive duration are failures. No Python callbacks touch media buffers.

On exit, the tool attempts to reset only its own throwaway encoder to its initial
bitrate and tears down its pipeline to NULL, retaining setting-only restoration
when post-restoration evidence is absent. Teardown failure stays explicit. This
cleanup is not the durable ownership/recovery protocol required for a user's
running stream. The external container boundary handles stuck calls and crashes.

Endpoint decoder progress cannot establish maximum frame gap, continuous playback,
WebRTC continuity, quality, benefit, production overhead or causality. A setter
return/getter value need not imply an output-rate effect. Compare all observed
windows without treating a configured bitrate ratio as the measured response.
`live_authority=false`, no selected family and `unavailable_unverified` are retained
regardless of results. Full acceptance still requires the core's
[live-evidence contract](../../latency_fingerprinting/docs/live_probes/N10_LIVE_EVIDENCE_CONTRACT.md),
an owned producer adapter and real receiver/watchdog/restoration/restart trials.

Run fake failure-boundary tests with:

```sh
cd engine/runtime
python3 -m unittest discover -s tests/python -p 'test_live_probe_*.py' -v
```
