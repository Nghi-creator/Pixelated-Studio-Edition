# N4 browser stage tracing

Browser tracing defaults off.
Set these Vite build-time variables and rebuild:

```text
VITE_N4_STAGE_TRACE=1
VITE_N4_STAGE_TRACE_METHOD=api-v1
VITE_N4_STAGE_TRACE_EVERY_NTH_FRAME=1
VITE_N4_STAGE_TRACE_MAX_FRAMES=2000
VITE_N4_STAGE_TRACE_MAX_EVENTS=10000
```

By default, only presentationTime and API callback now are retained as relative integer ns.
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
(null). [export/control](n4-stage-trace-export.md) now provides an explicit finish/download button; offline reconstruction is available in the sibling core.

## Integration testing

See [standalone export and integration](n4-stage-trace-export.md) for producer-to-core
reproduction commands and remaining real capture/overhead gates. Both collectors
and exporters reproduce pinned synthetic records; this is software evidence.

## Callback execution method

Choose `VITE_N4_STAGE_TRACE_METHOD=execution-v2` and rebuild to add a
`performance.now()` reading at callback entry, before metadata/collector work.
This explicitly exports browser `stage-trace-record-v2`, manifest version 2 and
`n4-browser-execution-v1`. Core inspection keeps the old API callback-lag result
and adds `presentation-execution-lag` from reported submission to observed callback
entry. Negative deltas remain excluded; zeros remain precision-limited samples.
Neither method establishes physical display or end-to-end latency.

All three endpoints share the existing global frame/event capacity. A failed entry
clock read accounts one invalid dropped event and retains both original endpoints;
finite clock regression closes the lifetime, including on unsampled callbacks.
Cancellation neutralizes late delivery. Missing APIs mark both source capabilities
unavailable. Default v1 performs no extra clock read and preserves its fixture bytes.

The sibling core’s `docs/observability/N4_BROWSER_EXECUTION_CONTRACT.md` specifies
the exact additive fields, independent fixture pins and API/CLI handoff. Producer
`browserStageTraceV2.test.ts` can export synthetic archives using
`N4_BROWSER_EXECUTION_BUNDLES_DIR` for the core’s read-only reproduction checker.
Live versioned capture/overhead results are recorded separately from these tests.
