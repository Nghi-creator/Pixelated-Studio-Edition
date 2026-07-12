import assert from "node:assert/strict";
import test from "node:test";
import {
  createResearchRunSummary,
  createResearchRunSummaryFilename,
  researchRunSummaryToJson,
} from "../../../src/features/player/research/researchRunSummary.ts";
import {
  createResearchRunEvent,
  type ResearchRunEvent,
} from "../../../src/features/player/research/researchRunEvents.ts";
import type { StreamTelemetryCsvSample } from "../../../src/features/player/telemetry/streamTelemetryExport.ts";

const baseSample: StreamTelemetryCsvSample = {
  bitrateKbps: 1000,
  capturedAt: "2026-07-04T02:03:04.000Z",
  connectionState: "connected",
  elapsedMs: 0,
  fps: 60,
  gameId: "beat-beast",
  iceConnectionState: "connected",
  jitterMs: 4,
  lastEngineError: null,
  packetsLostDelta: 0,
  packetsLostTotal: 0,
  playerMode: "host",
  sessionId: "session-1",
  status: "playing",
};

function event(
  name: ResearchRunEvent["name"],
  elapsedMs: number,
  details?: Record<string, unknown>,
) {
  return createResearchRunEvent({
    details,
    name,
    nowMs: Date.parse("2026-07-04T02:03:04.000Z") + elapsedMs,
    runId: "edge-run-1",
    runStartedAt: Date.parse("2026-07-04T02:03:04.000Z"),
    sessionId: "session-1",
  });
}

test("research run summary computes numeric and event-derived stats", () => {
  const samples = [
    baseSample,
    {
      ...baseSample,
      bitrateKbps: 1200,
      elapsedMs: 30_000,
      fps: 58,
      jitterMs: 8,
      packetsLostTotal: 3,
    },
    {
      ...baseSample,
      bitrateKbps: 800,
      elapsedMs: 60_000,
      fps: null,
      jitterMs: 2,
      packetsLostTotal: 4,
    },
  ];
  const events = [
    event("start_game_emitted", 1500),
    event("python_ready", 2400),
    event("first_non_black_frame", 3200),
    event("connection_disconnected", 40_000),
    event("connection_recovered", 45_000),
    event("engine_error", 50_000, { source: "black_frame_stall" }),
  ];

  assert.deepEqual(
    createResearchRunSummary({
      events,
      generatedAt: new Date("2026-07-04T02:04:04.000Z"),
      runId: "edge-run-1",
      samples,
      sessionId: "session-1",
    }),
    {
      eventCount: 6,
      generatedAt: "2026-07-04T02:04:04.000Z",
      metrics: {
        bitrateKbps: {
          max: 1200,
          mean: 1000,
          median: 1000,
          min: 800,
          p95: 1200,
        },
        fps: {
          max: 60,
          mean: 59,
          median: 59,
          min: 58,
          p95: 60,
        },
        jitterMs: {
          max: 8,
          mean: 4.667,
          median: 4,
          min: 2,
          p95: 8,
        },
      },
      packetLoss: {
        lossPerMinute: 4,
        totalDelta: 4,
        totalLatest: 4,
      },
      recording: {
        durationMs: 60_000,
        sampleCount: 3,
      },
      runId: "edge-run-1",
      sessionId: "session-1",
      stability: {
        disconnectCount: 1,
        recoveredCount: 1,
        stallCount: 1,
      },
      timings: {
        firstFrameMs: 3200,
        pythonReadyMs: 2400,
        startGameMs: 1500,
      },
    },
  );
});

test("research run summary preserves nulls when samples and events are absent", () => {
  const summary = createResearchRunSummary({
    events: [],
    generatedAt: new Date("2026-07-04T02:04:04.000Z"),
    runId: "edge-run-1",
    samples: [],
    sessionId: "session-1",
  });

  assert.equal(summary.recording.sampleCount, 0);
  assert.equal(summary.recording.durationMs, 0);
  assert.equal(summary.metrics.fps.median, null);
  assert.equal(summary.metrics.bitrateKbps.p95, null);
  assert.equal(summary.packetLoss.lossPerMinute, null);
  assert.equal(summary.timings.firstFrameMs, null);
});

test("research run summary JSON is pretty printed with trailing newline", () => {
  const json = researchRunSummaryToJson(
    createResearchRunSummary({
      events: [],
      generatedAt: new Date("2026-07-04T02:04:04.000Z"),
      runId: "edge-run-1",
      samples: [],
      sessionId: "session-1",
    }),
  );

  assert.match(json, /\n {2}"eventCount": 0,\n/);
  assert.equal(json.endsWith("\n"), true);
});

test("research run summary filenames are filesystem-safe", () => {
  assert.equal(
    createResearchRunSummaryFilename({
      gameId: "Beat Beast / edge study",
      recordedAt: new Date("2026-07-04T02:04:04.000Z"),
      runId: "edge:run:1",
    }),
    "pixelated-research-summary-Beat-Beast-edge-study-edge-run-1-2026-07-04T02-04-04-000Z.json",
  );
});
