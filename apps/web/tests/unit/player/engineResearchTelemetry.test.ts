import assert from "node:assert/strict";
import test from "node:test";
import {
  createEngineResearchTelemetrySamples,
  createUnavailableEngineTelemetrySamples,
  elapsedMsFromCapturedAt,
  EngineResearchTelemetryBuffer,
  engineResearchTelemetrySamplesToCsv,
  parseEngineResearchTelemetryResponse,
} from "../../../src/features/player/telemetry/engineResearchTelemetry.ts";

const response = {
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
    cameraCpuPercent: 33.5,
    cameraRssMb: 210,
    cameraRunning: true,
    cpuCapacityCores: 4,
    emulatorCpuPercent: 72.25,
    emulatorRssMb: 350,
    emulatorRunning: true,
    logicalCpuCount: 8,
    nodeCpuPercent: 4.5,
    nodeRssMb: 120,
    nodeRunning: true,
    peerCount: 1,
    runtimeKind: "libretro",
  },
  schemaVersion: 1,
  sessionId: "session-1",
} as const;

test("engine telemetry parsing enforces schema and session identity", () => {
  assert.deepEqual(
    parseEngineResearchTelemetryResponse(response, "session-1"),
    response,
  );
  assert.equal(
    parseEngineResearchTelemetryResponse(response, "different-session"),
    null,
  );
  assert.equal(
    parseEngineResearchTelemetryResponse(
      { ...response, schemaVersion: 2 },
      "session-1",
    ),
    null,
  );
});

test("one poll becomes separate engine and encoder source samples", () => {
  const samples = createEngineResearchTelemetrySamples({
    elapsedMs: 1_000,
    gameId: "game-1",
    response,
    runId: "run-1",
  });

  assert.equal(samples.length, 2);
  assert.deepEqual(
    samples.map((sample) => sample.source),
    ["engine_runtime", "encoder_pipeline"],
  );
  const [engineSample, encoderSample] = samples;
  assert.ok(engineSample);
  assert.ok(encoderSample);
  assert.equal(engineSample.nodeCpuPercent, 4.5);
  assert.equal(engineSample.framesInTotal, null);
  assert.equal(encoderSample.nodeCpuPercent, null);
  assert.equal(encoderSample.framesInTotal, 101);
  assert.equal(engineSample.available, true);
  assert.equal(encoderSample.available, true);
});

test("engine telemetry elapsed time uses the exported wall-clock timestamp", () => {
  const startedAt = Date.parse("2026-08-10T01:02:00.250Z");

  assert.equal(
    elapsedMsFromCapturedAt("2026-08-10T01:02:03.000Z", startedAt),
    2_750,
  );
  assert.equal(
    elapsedMsFromCapturedAt("2026-08-10T01:01:59.999Z", startedAt),
    null,
  );
  assert.equal(elapsedMsFromCapturedAt("not-a-date", startedAt), null);
});

test("unavailable polls preserve missing metrics as empty CSV cells", () => {
  const samples = createUnavailableEngineTelemetrySamples({
    capturedAt: "2026-08-10T01:02:03.000Z",
    elapsedMs: 0,
    error: "+engine unavailable",
    gameId: "game-1",
    runId: "run-1",
    sessionId: "session-1",
  });
  const csv = engineResearchTelemetrySamplesToCsv(samples);

  const [engineSample, encoderSample] = samples;
  assert.ok(engineSample);
  assert.ok(encoderSample);
  assert.equal(engineSample.nodeCpuPercent, null);
  assert.equal(encoderSample.framesInTotal, null);
  assert.match(csv, /,false,'\+engine unavailable,/);
  assert.doesNotMatch(csv, /,0,0,0,/);
});

test("engine telemetry CSV keeps contract metric order", () => {
  const samples = createEngineResearchTelemetrySamples({
    elapsedMs: 1_000,
    gameId: "game-1",
    response,
    runId: "run-1",
  });

  assert.equal(
    engineResearchTelemetrySamplesToCsv(samples),
    [
      "captured_at,elapsed_ms,schema_version,run_id,session_id,game_id,source,available,error,node_cpu_percent,node_rss_mb,emulator_cpu_percent,emulator_rss_mb,camera_cpu_percent,camera_rss_mb,logical_cpu_count,cpu_capacity_cores,runtime_kind,node_running,emulator_running,camera_running,peer_count,frames_in_total,frames_out_total,frames_dropped_total,queue_level_buffers,pipeline_delay_proxy_ms,target_bitrate_kbps,target_fps,cpu_used,max_quantizer",
      "2026-08-10T01:02:03.000Z,1000,1,run-1,session-1,game-1,engine_runtime,true,,4.5,120,72.25,350,33.5,210,8,4,libretro,true,true,true,1,,,,,,,,,",
      "2026-08-10T01:02:03.000Z,1000,1,run-1,session-1,game-1,encoder_pipeline,true,,,,,,,,,,,,,,,101,99,2,3,,1500,60,6,48",
    ].join("\n"),
  );
});

test("engine telemetry buffer updates summaries incrementally and stays bounded", () => {
  const buffer = new EngineResearchTelemetryBuffer(3);
  const firstPoll = createEngineResearchTelemetrySamples({
    elapsedMs: 1_000,
    gameId: "game-1",
    response,
    runId: "run-1",
  });
  const secondPoll = createEngineResearchTelemetrySamples({
    elapsedMs: 2_000,
    gameId: "game-1",
    response,
    runId: "run-1",
  });

  assert.equal(buffer.append(firstPoll), true);
  assert.equal(buffer.snapshot.validComputeSampleCount, 1);
  assert.equal(buffer.append(secondPoll), false);
  assert.equal(buffer.snapshot.recordedEngineSamples.length, 2);
  assert.equal(buffer.snapshot.latestEngineSample?.elapsedMs, 1_000);
  assert.equal(buffer.snapshot.latestEncoderSample?.elapsedMs, 1_000);
  assert.equal(buffer.snapshot.validComputeSampleCount, 1);
  assert.equal(buffer.append(secondPoll), false);

  const stableSamples = buffer.snapshot.recordedEngineSamples;
  buffer.clear();
  assert.equal(buffer.snapshot.recordedEngineSamples, stableSamples);
  assert.equal(buffer.snapshot.recordedEngineSamples.length, 0);
  assert.equal(buffer.snapshot.validComputeSampleCount, 0);
  assert.equal(buffer.snapshot.hasUnavailableComputeSamples, false);
  assert.equal(buffer.snapshot.latestEngineSample, null);
});

test("engine telemetry buffer counts only valid pairs from the same poll", () => {
  const buffer = new EngineResearchTelemetryBuffer();
  const firstPoll = createEngineResearchTelemetrySamples({
    elapsedMs: 1_000,
    gameId: "game-1",
    response,
    runId: "run-1",
  });
  const secondPoll = createEngineResearchTelemetrySamples({
    elapsedMs: 2_000,
    gameId: "game-1",
    response: { ...response, capturedAt: "2026-08-10T01:02:04.000Z" },
    runId: "run-1",
  });
  const [firstEngine, firstEncoder] = firstPoll;
  const [secondEngine, secondEncoder] = secondPoll;
  assert.ok(firstEngine);
  assert.ok(firstEncoder);
  assert.ok(secondEngine);
  assert.ok(secondEncoder);

  buffer.append([{ ...firstEngine }, { ...firstEncoder, available: false }]);
  buffer.append([{ ...secondEngine, available: false }, { ...secondEncoder }]);

  assert.equal(buffer.snapshot.validComputeSampleCount, 0);
  assert.equal(buffer.snapshot.hasUnavailableComputeSamples, true);
});

test("engine telemetry buffer rejects unpaired and duplicate poll rows", () => {
  const buffer = new EngineResearchTelemetryBuffer();
  const poll = createEngineResearchTelemetrySamples({
    elapsedMs: 1_000,
    gameId: "game-1",
    response,
    runId: "run-1",
  });
  const [engineSample, encoderSample] = poll;
  assert.ok(engineSample);
  assert.ok(encoderSample);

  assert.equal(buffer.append([engineSample]), false);
  assert.equal(
    buffer.append([engineSample, engineSample, encoderSample]),
    false,
  );
  assert.equal(buffer.snapshot.recordedEngineSamples.length, 0);
});
