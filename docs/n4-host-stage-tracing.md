# N4 opt-in host stage tracing

**Status:** Host collector/hooks implemented, 2026-10-09; real capture and overhead
acceptance pending. Browser collection and standalone export/adoption are now delivered in Steps 4–5.

The camera now has optional bounded probes at capture output, pre-encoder queue
entry/exit and VP8 encoder input/output. Their timestamp source is local Python
monotonic time; queue residence and encoder boundary elapsed are distinct from
queue occupancy, CPU execution, source capture duration or network/display latency.
Existing research bundle v2, telemetry counters/getStats and playback settings
retain their meanings. The detached core's `docs/observability/N4_TRACE_CONTRACT.md`
and `N4_PRODUCER_CAPABILITIES.md` define the versioned contract and real acceptance.

## Configuration

Set camera/engine process environment before pipeline creation. Existing engine
launcher environment inheritance passes these settings through; host tracing uses launch configuration; the separate browser finish/export
control is documented in [standalone export](n4-stage-trace-export.md).

| Variable | Meaning |
| --- | --- |
| `PIXELATED_STAGE_TRACE=1` | Opt in; default 0 installs no tracing probes or signal handler |
| `PIXELATED_STAGE_TRACE_EVERY_NTH_FRAME` | Default 1; decimal integer 1–1000 |
| `PIXELATED_STAGE_TRACE_MAX_FRAMES` | Default 2000; decimal integer 1–2000 |
| `PIXELATED_STAGE_TRACE_MAX_EVENTS` | Default 10000; decimal integer 1–10000 |
| `PIXELATED_STAGE_TRACE_BUDGET_NS` | Optional declared capture-output-relative budget, positive integer ≤2^53−1 |

Invalid enabled configuration reports a fixed diagnostic and disables tracing,
preserving playback. Frame/event capacity is shared across the recording's peer
pipelines and closed epochs, with at most sixteen lifetimes. It never grows or
rolls over when peers reconnect. Exceeding capacity retains original prefixes
and exact loss counts; playback continues. No artifact is saved in this step.

## Implementation and limitations

- [Configuration](../engine/runtime/camera_trace_config.py) is closed and bounded.
- [Recording](../engine/runtime/camera_trace.py) retains producer-local clocks,
  aliases, sampling, exact counters and bounded internal PTS mappings.
- [Gst adapter](../engine/runtime/camera_trace_hooks.py) installs the complete pad
  set before PLAYING, rolls back partial setup and removes probes at teardown.
- [Camera](../engine/runtime/camera.py) names the source `video_capture`, closes
  peer scopes on errors/disconnects and finalizes on loop exit. Enabled tracing
  routes SIGTERM through GLib cleanup. SIGKILL cannot guarantee finalization.

Missing, duplicate or unprovable source PTS never gets heuristic pairing. Segment
changes and flushes isolate epochs; downstream pad segment keys must match the
current source before a buffer can be associated. Noninitial DISCONT pauses
collection until a new segment. Clock regression/failure closes its timing scope.
No PTS, peer/session identifier, frame pixels, SDP or private metadata is exported.
Callbacks do no I/O, logging, export or Python research-core calls, and always
preserve Gst media flow. Short mutexes serialize state; actual overhead is unmeasured.

After `HostTraceRecording.finish()`, its `snapshot()` returns detached sanitized
in-memory trace data with a caller-supplied producer commit. [Step 5 export](n4-stage-trace-export.md)
now publishes this as a standalone gzip TAR after shutdown; inspection remains Step 6. Real Linux/X11/VP8 correlation and five paired
CPU/FPS overhead trials remain required before full N4 completion. Factory lookup,
synthetic clocks and fake pads do not satisfy that gate.

## Verification

From the repository root:

```bash
npm run test:engine
npm run lint:engine
npm run check:lockfiles
```

From `engine/runtime`, the GI-free Python tests can also run directly:

```bash
python3 -m unittest discover -s tests/python -p 'test_camera_trace*.py' -v
```

The engine test runner executes them automatically; Python 3.10+ is required
alongside Node. Forty-one Python cases include ten export cases alongside sampling, overflow, duplicate/
missing PTS, segment/clock resets, concurrency, partial registration, teardown,
shutdown and disabled mode. Local engine result: 133 pass, one existing external
artifact skip, zero failures. Twenty-five test snapshots also validate against
the core's strict N4 models. Container builds, hosted execution and real-capture/
overhead measurements remain pending.

[Step 5 standalone export](n4-stage-trace-export.md) now supplies configured shutdown persistence; offline reconstruction remains Step 6.
