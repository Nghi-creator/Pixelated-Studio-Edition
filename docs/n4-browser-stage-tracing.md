# N4 browser stage tracing

Step 4 software is implemented in the web player; tracing defaults off.
Set these Vite build-time variables and rebuild:

```text
VITE_N4_STAGE_TRACE=1
VITE_N4_STAGE_TRACE_EVERY_NTH_FRAME=1
VITE_N4_STAGE_TRACE_MAX_FRAMES=2000
VITE_N4_STAGE_TRACE_MAX_EVENTS=10000
```

Only presentationTime and callback now are retained as relative integer ns.
presentedFrames gaps count missed presentations, including unsampled callbacks.
Receiver/decode/render-ready/wire-send support is explicitly unavailable. Optional
metadata and physical display predictions are excluded. Cumulative WebRTC means
and RTT keep their existing meanings. Callback lag is not one-way latency.

The collector owns at most sixteen lifetimes, with global prefix capacity and
exact frame/event loss. Stream/status changes detach and start separate aliases;
clock/counter reset closes collection until the next lifecycle attachment.
Missing APIs or failures cannot interrupt playback. Callback cancellation is
idempotent, and late callbacks are ignored. No per-frame React state update occurs.

`BrowserStageTraceRecording.finish()` cancels bindings; `snapshot(commit, provenance)`
returns detached in-memory evidence requiring a forty-hex commit. Runtime metadata
and absolute clock origins remain private. Effective clock resolution is unknown
(null). [Step 5 export/control](n4-stage-trace-export.md) now provides an explicit finish/download button; offline reconstruction is delivered in the sibling core as Step 6.

38 new software cases and 220 total web tests pass, plus web lint and production
build. The strict sibling Python contract accepts 23 synthetic snapshots. No live
browser timing or measured instrumentation overhead is claimed.

## Integration and next acceptance step

See [standalone export and integration](n4-stage-trace-export.md) for producer-to-core
reproduction commands and remaining real capture/overhead gates. Both collectors
and exporters reproduce pinned synthetic records; this is software evidence.
