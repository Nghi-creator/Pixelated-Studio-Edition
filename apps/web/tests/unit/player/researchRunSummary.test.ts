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
import {
  createEngineResearchTelemetrySamples,
  createUnavailableEngineTelemetrySamples,
} from "../../../src/features/player/telemetry/engineResearchTelemetry.ts";

const baseSample: StreamTelemetryCsvSample = {
  availableIncomingBitrateKbps: null,
  bitrateKbps: 1000,
  capturedAt: "2026-07-04T02:03:04.000Z",
  connectionState: "connected",
  decodeTimeMeanMs: null,
  elapsedMs: 0,
  fps: 60,
  framesDecoded: null,
  framesDropped: null,
  freezeCount: null,
  freezeDurationTotalMs: null,
  gameId: "beat-beast",
  iceConnectionState: "connected",
  jitterMs: 4,
  jitterBufferDelayMeanMs: null,
  keyFramesDecoded: null,
  lastEngineError: null,
  packetsLostDelta: 0,
  packetsLostTotal: 0,
  playerMode: "host",
  roundTripTimeMs: null,
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

  const summary = createResearchRunSummary({
    events,
    generatedAt: new Date("2026-07-04T02:04:04.000Z"),
    runId: "edge-run-1",
    samples,
    sessionId: "session-1",
  });

  assert.equal(summary.schemaVersion, 2);
  assert.deepEqual(summary.metrics.fps, {
    max: 60,
    mean: 59,
    median: 59,
    min: 58,
    p95: 60,
  });
  assert.equal(summary.metrics.jitterMs.mean, 4.667);
  assert.equal(summary.metrics.roundTripTimeMs.mean, null);
  assert.equal(summary.packetLoss.lossPerMinute, 4);
  assert.equal(summary.recording.durationMs, 60_000);
  assert.deepEqual(summary.stability, {
    disconnectCount: 1,
    recoveredCount: 1,
    stallCount: 1,
  });
  assert.equal(summary.timings.firstFrameMs, 3200);
  assert.equal(summary.validity.isValid, true);
  assert.equal(summary.validity.sources.browserWebrtc.sampleCount, 3);
  assert.equal(summary.compute.nodeCpuPercent.mean, null);
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
  assert.equal(summary.validity.isValid, false);
  assert.deepEqual(summary.validity.reasons, [
    "Browser WebRTC telemetry is unavailable.",
  ]);
});

test("research run summary treats the first packet-loss total as its baseline", () => {
  const summary = createResearchRunSummary({
    events: [],
    runId: "edge-run-1",
    samples: [
      { ...baseSample, packetsLostTotal: 180 },
      { ...baseSample, elapsedMs: 60_000, packetsLostTotal: 180 },
    ],
    sessionId: "session-1",
  });

  assert.deepEqual(summary.packetLoss, {
    lossPerMinute: 0,
    totalDelta: 0,
    totalLatest: 180,
  });
});

test("research run duration is the observed sample span", () => {
  const summary = createResearchRunSummary({
    events: [],
    runId: "edge-run-1",
    samples: [
      { ...baseSample, elapsedMs: 5_000 },
      { ...baseSample, elapsedMs: 65_000 },
    ],
    sessionId: "session-1",
  });

  assert.equal(summary.recording.durationMs, 60_000);
});

test("research run summary rejects a single browser sample", () => {
  const summary = createResearchRunSummary({
    events: [],
    runId: "edge-run-1",
    samples: [baseSample],
    sessionId: "session-1",
  });

  assert.equal(summary.validity.isValid, false);
  assert.deepEqual(summary.validity.reasons, [
    "Browser WebRTC telemetry requires at least two samples.",
  ]);
});

test("research run summary rejects partial compute gaps and excludes them from stats", () => {
  const engineResponse = {
    capturedAt: "2026-08-10T01:02:03.000Z",
    encoder: {
      available: true,
      cpuUsed: 6,
      error: null,
      framesDroppedTotal: 2,
      framesInTotal: 101,
      framesOutTotal: 99,
      maxQuantizer: 48,
      pipelineDelayProxyMs: null,
      queueLevelBuffers: 3,
      targetBitrateKbps: 1_500,
      targetFps: 60,
      updatedAt: "2026-08-10T01:02:02.900Z",
    },
    engine: {
      cameraCpuPercent: 30,
      cameraRssMb: 210,
      cameraRunning: true,
      cpuCapacityCores: 4,
      emulatorCpuPercent: 70,
      emulatorRssMb: 350,
      emulatorRunning: true,
      logicalCpuCount: 8,
      nodeCpuPercent: 5,
      nodeRssMb: 120,
      nodeRunning: true,
      peerCount: 1,
      runtimeKind: "libretro" as const,
    },
    schemaVersion: 1 as const,
    sessionId: "session-1",
  };
  const available = createEngineResearchTelemetrySamples({
    elapsedMs: 1_000,
    gameId: "game-1",
    response: engineResponse,
    runId: "edge-run-1",
  });
  const unavailable = createUnavailableEngineTelemetrySamples({
    capturedAt: "2026-08-10T01:02:04.000Z",
    elapsedMs: 2_000,
    error: "private diagnostic",
    gameId: "game-1",
    runId: "edge-run-1",
    sessionId: "session-1",
  }).map((sample) => ({
    ...sample,
    framesDroppedTotal: sample.source === "encoder_pipeline" ? 999 : null,
    nodeCpuPercent: sample.source === "engine_runtime" ? 999 : null,
  }));
  const summary = createResearchRunSummary({
    engineSamples: [...available, ...unavailable],
    events: [],
    requiresComputeTelemetry: true,
    runId: "edge-run-1",
    samples: [baseSample, { ...baseSample, elapsedMs: 1_000 }],
    sessionId: "session-1",
  });

  assert.equal(summary.validity.isValid, false);
  assert.deepEqual(summary.validity.reasons, [
    "Engine runtime telemetry has unavailable samples.",
    "Encoder pipeline telemetry has unavailable samples.",
  ]);
  assert.equal(summary.compute.nodeCpuPercent.mean, 5);
  assert.equal(summary.compute.encoderFramesDroppedLatest, 2);
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
