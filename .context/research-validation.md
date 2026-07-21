# Research Instrumentation and Validation

Last reviewed: 2026-07-22

The original instrumentation roadmap is implemented. This document records the
current evidence contract and the remaining research procedure rather than a
completed build plan.

## Implemented Evidence Contract

The player supports versioned research runs for `localhost`, `lan`,
`browser_only_baseline`, and custom scenarios. A run records:

- Stable run/session identifiers, scenario, capture time, game, player mode,
  browser user agent, network notes, cold/warm start, and stream profile.
- Periodic stream telemetry including FPS, bitrate, jitter, packet-loss totals
  and deltas, connection state, and playback status.
- Lifecycle events such as play click, signaling/track progress, first
  non-black frame, disconnect/recovery, retry, and engine errors.
- Summary statistics and event-derived first-frame/recovery measurements.
- Browser-only baseline fields for startup time, FPS, memory, emulator id, and
  manual CPU/device notes.

The one-click TAR bundle contains:

```text
run-metadata.json
stream-telemetry.csv
stream-events.csv
summary.json
browser-baseline.json       # browser baseline runs only
performance-network.png     # when graph samples exist
```

Exports neutralize spreadsheet-formula cells, sanitize filenames and archive
paths, and must never contain engine tokens or hosted credentials.

## Recommended Experiment Procedure

1. Choose one game/build and one stream profile for a comparison set.
2. Record whether each run is cold or warm.
3. Capture repeated localhost, LAN, and browser-only baseline trials.
4. Keep host/client hardware, browser, OS, and network notes consistent.
5. Export the research bundle immediately after each run.
6. Verify metadata, sample duration, event sequence, and graph before accepting
   the trial.
7. Store accepted bundles outside the repository with a read-only backup.
8. Derive thesis tables from `summary.json`, retaining CSV/events as the source
   evidence.

Use `lan-manual-smoke-checklist.md` when a run also validates two-device LAN
behavior.

## Remaining Research Work, Not Product Blockers

- Define trial count, warm-up policy, network controls, and exclusion criteria.
- Decide whether Chapter 5 uses the existing percentile/statistic set or an
  external analysis notebook for confidence intervals.
- Capture representative real-device datasets across target browsers.
- Add full-run graph variants only if the current recent-window PNG is
  insufficient for the thesis.
- Add import/preview or hosted non-secret summary storage only if local bundles
  become operationally limiting.

Do not expand telemetry merely for visual polish. New fields need a concrete
research question, versioned schema impact, privacy review, and tests.
