# Research Instrumentation Roadmap

Last updated: 2026-07-04

This note captures proposed research-facing improvements for the streaming
telemetry work. The goal is to turn the player telemetry panel from useful
debug output into reproducible evidence for the personal edge cloud gaming
research proposal.

## Research Fit

The proposal evaluates whether a personal computer can act as a local edge
cloud gaming node. The strongest evidence needs controlled, comparable runs
across localhost, LAN, and browser-only baseline scenarios.

The current stream telemetry CSV and PNG export already supports useful
research evidence:

- Stable CSV columns for FPS, bitrate, packet loss, jitter, connection state,
  session id, game id, player mode, and status.
- Packet loss delta calculation.
- PNG graph export for recent performance and network trends.
- Tests around CSV shape, filename safety, graph windowing, and graph rendering.

The next improvements should prioritize reproducibility, event timing, and
summary analysis before adding more visual polish.

## Recommended Build Order

1. Add experiment run metadata and a schema version.
2. Add lifecycle timing events and first visible frame detection.
3. Add summary statistics export.
4. Add one-click research bundle export.
5. Add a browser-only baseline recorder with a comparable data shape.
6. Refactor telemetry modules after the research data shape stabilizes.

## 1. Experiment Run Metadata

Add an experiment-run layer around telemetry capture and export.

Useful metadata fields:

- `schema_version`
- `run_id`
- `scenario`: `localhost`, `lan`, `browser_only_baseline`, or manual/custom
- `client_device`
- `client_browser`
- `client_os`
- `host_device`
- `host_os`
- `network_type`
- `stream_profile_id`
- `stream_profile_fps`
- `stream_profile_bitrate_kbps`
- `runtime_id`
- `runtime_kind`
- `game_id`
- `game_title`
- `cold_start`
- `notes`

This makes exported data suitable for thesis tables instead of anonymous debug
samples. It also gives future CSV/JSON changes a versioned contract.

## 2. Lifecycle Timing Events

Record discrete timeline events in addition to periodic numeric samples.

Important events:

- `play_clicked`
- `backend_session_requested`
- `backend_session_created`
- `engine_stop_stale_session_requested`
- `start_game_emitted`
- `python_ready`
- `offer_sent`
- `answer_received`
- `remote_track_received`
- `first_non_black_frame`
- `stream_playing`
- `connection_disconnected`
- `connection_recovered`
- `connection_failed`
- `retry_started`
- `engine_error`

Derived metrics:

- Click-to-first-frame time.
- Game boot-to-ready time.
- Signaling duration.
- Reconnect duration.
- Stall or black-frame duration.
- Time spent connected vs disconnected.

This directly supports the proposal's startup, boot, first-frame, reconnect,
and stability evaluation criteria.

## 3. Summary Statistics

Generate a compact summary from each recorded run.

Useful statistics:

- Sample count and recording duration.
- Median, mean, min, max, and P95 FPS.
- Median, mean, min, max, and P95 bitrate.
- Median, mean, min, max, and P95 jitter.
- Total packet loss.
- Packet loss per minute.
- Disconnect count.
- Stall or sustained black-frame count.
- Time-to-first-frame when lifecycle events are available.
- Reconnect time when lifecycle events are available.

The CSV remains the source of truth, but summary stats are what should flow into
Chapter 5 tables.

## 4. Research Bundle Export

Add a one-click export that saves all evidence for a run together.

Suggested bundle contents:

```text
run-metadata.json
stream-telemetry.csv
stream-events.csv
summary.json
performance-network.png
```

The bundle can start as separate downloads if browser APIs make zip creation
awkward. A zip export is useful later, but the research value comes from the
consistent file set and shared `run_id`.

## 5. Browser-Only Baseline Recorder

Add a baseline recording mode for browser-only/WebAssembly emulation.

The baseline does not need WebRTC fields, but it should export a comparable
shape:

- `schema_version`
- `run_id`
- `scenario = browser_only_baseline`
- Startup or game-load time.
- FPS if available.
- Browser/device metadata.
- Browser memory if available.
- Runtime/emulator identifier.
- Game id/title.
- Manual notes for CPU/RAM when automated measurement is unavailable.

This keeps the edge-node vs browser-only comparison honest and easier to write
about.

## Refactoring Propositions

### Separate Collection, Recording, Analysis, And Export

The current web telemetry code can evolve toward clearer ownership:

- Collector: reads WebRTC/browser/runtime state.
- Recorder: stores time-series samples and timeline events.
- Analyzer: computes summary statistics.
- Exporters: CSV, PNG, JSON, and bundle output.

Do this after metadata and timing events are introduced, so the abstraction
matches the real research data shape.

### Add An Event Timeline Model

Periodic samples answer "what was the stream quality over time?" Events answer
"how long did each stage take?" Keep them separate so first-frame and reconnect
metrics do not have to be inferred from FPS or bitrate samples.

### Normalize Packet Loss Semantics

Keep packet loss fields explicit:

- `packets_lost_total`
- `packets_lost_delta`
- Optional derived packet loss rate per second or per minute.

This avoids ambiguity during CSV analysis.

### Make Graph Rendering More Reusable

The current PNG renderer is useful, but it mixes metric choice, layout, and
visual style. Once stream and baseline exports both exist, move toward a small
chart spec so research graphs stay consistent across modes.

## Lower Priority Ideas

- Add graph exports for the full run as well as the latest one-minute window.
- Add manual environment presets for common test machines.
- Add an experiment checklist UI before recording starts.
- Add import/preview for previously exported research runs.
- Add hosted API support for storing non-secret experiment summaries, only if
  local export becomes insufficient.

## Notes For Future Implementation

- Keep raw engine tokens out of exported metadata.
- Avoid storing secrets in hosted metrics or local research bundles.
- Prefer local-first export for thesis evidence unless collaborative hosted
  analysis becomes necessary.
- Treat browser CPU/RAM as partially manual unless reliable browser APIs are
  available in the target browser.
- Preserve existing CSV columns when possible; add schema versioning before
  changing column semantics.
