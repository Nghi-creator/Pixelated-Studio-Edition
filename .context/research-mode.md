# Research Mode context

**Status:** Implemented and verified for the P0 controlled-run workflow  
**Consumer:** `latency_fingerprinting` Pixelated bundle adapter

## Purpose and scope

Research Mode is an opt-in, session-scoped workflow for producing reproducible
local telemetry bundles from the existing cloud player. It is an evidence
capture surface for the latency-fingerprinting project, not the diagnosis
engine itself.

```text
Normal mode
Game card -> /play/:id

Research mode
Game card -> run setup -> shared research player -> result and exports
```

The mode is stored in `sessionStorage`. Research routes imply research intent
on refresh, while a future browser session starts in normal mode. The cloud
catalog is the supported entry point; Local Vault and multiplayer research
protocols are deferred.

## Product contract

The library toolbar switches between Normal mode and Research mode. Research
mode changes game destinations to the setup page and suppresses favorite/social
actions on research-routed cards. It does not use a persistent banner or
duplicate the player implementation.

The setup page creates one versioned `ResearchRunConfig` containing:

- comparison case ID and run ID;
- healthy, degraded, relief or custom phase;
- fixed stream profile and audio state;
- warm-up and recording durations;
- scenario, network and cold-start state;
- anonymized node/runtime labels;
- intervention label and optional notes.

The research player reuses the normal WebRTC, video, input and control stack.
It retains gameplay, fullscreen, pixel rendering and keyboard mapping while
suppressing community, sharing/lobby and play-count effects. The configured
profile and audio state are locked during formal capture.

Normal gameplay does not expose Stream Stats. In Research Mode, Stream Stats is
an optional, read-only live monitor for current FPS, bitrate, ICE, loss/jitter
and rolling graphs. It is not an export or capture-control surface.

## Capture lifecycle

The reducer-backed research controller owns the formal run lifecycle:

```text
preparing -> connecting -> ready -> warming_up -> recording -> completed
                                               \-> invalid
any active state -> cancelled
```

Warm-up begins only after playback, connected ICE and the first visible frame.
Recording clears previous capture data, starts and stops automatically, and
uses monotonic time for duration. Connection, session or profile instability
invalidates the run instead of silently producing accepted evidence.

The HUD shows the phase, profile, readiness, countdown and sample counts. The
terminal result shows validity, duration, browser metrics, engine/encoder
signals and effective settings. Its actions are:

- Retake phase;
- Download CSVs, which downloads the individual CSV files;
- Download TAR, the authoritative complete research artifact;
- return to the research library.

## Telemetry sources

Browser WebRTC telemetry is sampled once per second and includes nullable,
standards-derived values such as:

- FPS and received bitrate;
- packet-loss cumulative and interval values;
- jitter and selected-pair RTT;
- decoded/dropped frames;
- mean decode and jitter-buffer delay;
- freeze count/duration and keyframes;
- available incoming bitrate.

The token-gated, session-bound engine research endpoint contributes separate
`engine_runtime` and `encoder_pipeline` samples. These include interval CPU and
RSS for Node, the game runtime and camera/GStreamer path; CPU capacity; process
state; frame counters; queue levels/drops; and effective encoder settings.

Unavailable measurements remain null/empty. They must never be represented as
zero. Direct encoder processing time is not claimed; the unsupported
pipeline-delay proxy remains explicitly identified as unavailable.

## Bundle v2 contract

The complete TAR contains:

```text
bundle-manifest.json
run-metadata.json
stream-telemetry.csv
engine-telemetry.csv
stream-events.csv
summary.json
performance-network.png  # optional preview
```

`engine-telemetry.csv` contains both engine-runtime and encoder-pipeline rows,
distinguished by the `source` column. The convenience CSV action downloads
`stream-telemetry.csv`, `stream-events.csv` and `engine-telemetry.csv` as
individual files using phase/run-aware filenames.

Bundle v1 remains readable downstream. Bundle v2 binds its phase, comparison
case, run ID, file inventory, source availability and measurement support in
the manifest. The `latency_fingerprinting` adapter validates these declarations
and converts accepted bundles into core observation windows.

## Privacy and identity

Formal exports omit credentials, engine tokens, share URLs, usernames,
hostnames, absolute paths and raw peer IDs. Event details are recursively
sanitized. Random experiment run/session identifiers may remain for joining
the bounded sources but are not active credentials.

Packet loss is a cumulative WebRTC counter. The first recorded total establishes
the window baseline and therefore has a delta of zero; only subsequent
increases count as loss during the formal window.

Startup events may use a preliminary session before WebRTC retry settles. Once
the final session appears, formal lifecycle events and telemetry must use it
consistently.

## Code boundaries

The route entry remains small and delegates gameplay composition:

```text
pages/user/Player.tsx
  -> player/components/shell/PlayerExperience.tsx
       -> player/hooks/research/usePlayerResearchSession.ts
       -> player/components/research/ResearchPlayerOutput.tsx
```

Research-mode routing, setup, controller and result presentation live under
`apps/web/src/features/research-mode/`. Shared gameplay, WebRTC, telemetry and
bundle construction remain under `apps/web/src/features/player/`. Engine
resource and encoder instrumentation remain under `engine/runtime/`.

Normal and research behavior must continue to share playback code. Do not add a
second player, infer research state from scattered flags, or restore manual
research export controls to normal gameplay.

## Current P0 evidence

The controlled `healthy`, `degraded` and `relief` TARs captured after the
privacy, packet-loss and session-rollover fixes are accepted by the downstream
adapter. They contain complete browser, engine and encoder evidence. The
degraded run shows repeated compute/encoder pressure and a partial response to
the Performance-profile relief.

Remaining work belongs to the experiment record rather than this application:

- finalize the anonymized `context.json`;
- record the intervention/probe and restoration evidence;
- derive the observation and match result;
- preserve the conclusion as controlled-real P0 feasibility evidence, not a
  general product-accuracy claim.

## Deferred work

- automated diagnosis or remediation initiated by the application;
- input-to-photon hardware measurement;
- persisted run history and result reopening;
- multi-participant, Local Vault and native-runtime research protocols;
- server-side storage of private research artifacts.
