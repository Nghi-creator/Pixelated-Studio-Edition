import type { EngineResearchTelemetryResponse } from "./engineResearchTelemetryResponse.ts";
export { parseEngineResearchTelemetryResponse } from "./engineResearchTelemetryResponse.ts";
export type { EngineResearchTelemetryResponse } from "./engineResearchTelemetryResponse.ts";
export { ENGINE_TELEMETRY_CSV_HEADERS, engineResearchTelemetrySamplesToCsv } from "./engineResearchTelemetryCsv.ts";

import {
  RESEARCH_TELEMETRY_SCHEMA_VERSION,
  type EncoderResearchMetrics,
  type EngineResearchMetrics,
  type ResearchTelemetrySource,
} from "../../research-mode/researchTelemetryContract.ts";

export type EngineResearchTelemetrySample = EngineResearchMetrics &
  EncoderResearchMetrics & {
    sampleSequence?: number;
    sampleIntervalMs?: number | null;
    available: boolean;
    cameraRunning: boolean | null;
    capturedAt: string;
    elapsedMs: number;
    emulatorRunning: boolean | null;
    error: string | null;
    gameId: string;
    nodeRunning: boolean | null;
    peerCount: number | null;
    runId: string;
    schemaVersion: typeof RESEARCH_TELEMETRY_SCHEMA_VERSION;
    sessionId: string;
    source: Extract<
      ResearchTelemetrySource,
      "encoder_pipeline" | "engine_runtime"
    >;
  };

export const MAX_ENGINE_RESEARCH_TELEMETRY_ROWS = 10_000;

export class EngineResearchTelemetryBuffer {
  private readonly maxRows: number;
  private readonly values: EngineResearchTelemetrySample[] = [];
  private validComputeSampleCount = 0;
  private hasUnavailableComputeSamples = false;
  private latestEncoderSample: EngineResearchTelemetrySample | null = null;
  private latestEngineSample: EngineResearchTelemetrySample | null = null;

  constructor(maxRows = MAX_ENGINE_RESEARCH_TELEMETRY_ROWS) {
    if (!Number.isInteger(maxRows) || maxRows <= 0) {
      throw new Error("Engine research telemetry row limit must be positive.");
    }
    this.maxRows = maxRows;
  }

  append(samples: EngineResearchTelemetrySample[]) {
    let appended = false;
    const pollPairs = completePollPairs(samples);
    if (pollPairs.length * 2 !== samples.length) return false;
    for (const [engineSample, encoderSample] of pollPairs) {
      if (this.values.length + 2 > this.maxRows) break;
      this.values.push(engineSample, encoderSample);
      appended = true;
      this.latestEngineSample = engineSample;
      this.latestEncoderSample = encoderSample;
      if (!engineSample.available || !encoderSample.available) {
        this.hasUnavailableComputeSamples = true;
      }
      if (
        engineSample.available &&
        engineSample.nodeCpuPercent !== null &&
        engineSample.emulatorCpuPercent !== null &&
        engineSample.cameraCpuPercent !== null &&
        encoderSample.available
      ) {
        this.validComputeSampleCount += 1;
      }
    }
    return appended;
  }

  clear() {
    this.values.length = 0;
    this.validComputeSampleCount = 0;
    this.hasUnavailableComputeSamples = false;
    this.latestEncoderSample = null;
    this.latestEngineSample = null;
  }

  get snapshot() {
    return {
      latestEncoderSample: this.latestEncoderSample,
      latestEngineSample: this.latestEngineSample,
      hasUnavailableComputeSamples: this.hasUnavailableComputeSamples,
      recordedEngineSamples: this.values,
      validComputeSampleCount: this.validComputeSampleCount,
    };
  }
}

function samplePollIdentity(sample: EngineResearchTelemetrySample) {
  return JSON.stringify([
    sample.runId,
    sample.sessionId,
    sample.gameId,
    sample.capturedAt,
    sample.elapsedMs,
  ]);
}

function completePollPairs(samples: EngineResearchTelemetrySample[]) {
  const polls = new Map<
    string,
    {
      encoder: EngineResearchTelemetrySample | null;
      engine: EngineResearchTelemetrySample | null;
      invalid: boolean;
    }
  >();
  for (const sample of samples) {
    const identity = samplePollIdentity(sample);
    const poll = polls.get(identity) ?? {
      encoder: null,
      engine: null,
      invalid: false,
    };
    if (sample.source === "engine_runtime") {
      if (poll.engine) poll.invalid = true;
      poll.engine = sample;
    } else {
      if (poll.encoder) poll.invalid = true;
      poll.encoder = sample;
    }
    polls.set(identity, poll);
  }
  return [...polls.values()]
    .filter(
      (poll): poll is {
        encoder: EngineResearchTelemetrySample;
        engine: EngineResearchTelemetrySample;
        invalid: false;
      } => !poll.invalid && poll.engine !== null && poll.encoder !== null,
    )
    .map((poll) => [poll.engine, poll.encoder] as const);
}

export function hasExactlyPairedEngineTelemetrySamples(
  samples: EngineResearchTelemetrySample[],
) {
  return completePollPairs(samples).length * 2 === samples.length;
}

export function elapsedMsFromCapturedAt(
  capturedAt: string,
  recordingStartedAt: number,
) {
  const capturedAtMs = Date.parse(capturedAt);
  if (
    !Number.isFinite(capturedAtMs) ||
    !Number.isFinite(recordingStartedAt) ||
    recordingStartedAt < 0 ||
    capturedAtMs < recordingStartedAt
  ) {
    return null;
  }
  return capturedAtMs - recordingStartedAt;
}

const EMPTY_ENGINE_METRICS: EngineResearchMetrics = {
  cameraCpuPercent: null,
  cameraRssMb: null,
  cpuCapacityCores: null,
  emulatorCpuPercent: null,
  emulatorRssMb: null,
  logicalCpuCount: null,
  nodeCpuPercent: null,
  nodeRssMb: null,
  runtimeKind: null,
};
const EMPTY_ENCODER_METRICS: EncoderResearchMetrics = {
  cpuUsed: null,
  framesDroppedTotal: null,
  framesInTotal: null,
  framesOutTotal: null,
  maxQuantizer: null,
  pipelineDelayProxyMs: null,
  queueLevelBuffers: null,
  targetBitrateKbps: null,
  targetFps: null,
};

function identity({
  capturedAt,
  elapsedMs,
  gameId,
  runId,
  sessionId,
}: {
  capturedAt: string;
  elapsedMs: number;
  gameId: string;
  runId: string;
  sessionId: string;
}) {
  return {
    capturedAt,
    elapsedMs,
    gameId,
    runId,
    schemaVersion: RESEARCH_TELEMETRY_SCHEMA_VERSION,
    sessionId,
  };
}

export function createEngineResearchTelemetrySamples({
  elapsedMs,
  gameId,
  response,
  runId,
}: {
  elapsedMs: number;
  gameId: string;
  response: EngineResearchTelemetryResponse;
  runId: string;
}): EngineResearchTelemetrySample[] {
  const sampleIdentity = { sampleSequence: response.sampleSequence,
    sampleIntervalMs: response.sampleIntervalMs, ...identity({
    capturedAt: response.capturedAt,
    elapsedMs,
    gameId,
    runId,
    sessionId: response.sessionId,
  }) };
  return [
    {
      ...EMPTY_ENCODER_METRICS,
      ...response.engine,
      ...sampleIdentity,
      available:
        response.engine.nodeRunning &&
        response.engine.emulatorRunning &&
        response.engine.cameraRunning,
      error: null,
      source: "engine_runtime",
    },
    {
      ...EMPTY_ENGINE_METRICS,
      ...response.encoder,
      ...sampleIdentity,
      cameraRunning: null,
      emulatorRunning: null,
      nodeRunning: null,
      peerCount: null,
      source: "encoder_pipeline",
    },
  ];
}

export function createUnavailableEngineTelemetrySamples({
  capturedAt,
  elapsedMs,
  error,
  gameId,
  runId,
  sessionId,
}: {
  capturedAt: string;
  elapsedMs: number;
  error: string;
  gameId: string;
  runId: string;
  sessionId: string;
}): EngineResearchTelemetrySample[] {
  const sampleIdentity = identity({
    capturedAt,
    elapsedMs,
    gameId,
    runId,
    sessionId,
  });
  return (["engine_runtime", "encoder_pipeline"] as const).map((source) => ({
    ...EMPTY_ENCODER_METRICS,
    ...EMPTY_ENGINE_METRICS,
    ...sampleIdentity,
    available: false,
    cameraRunning: null,
    emulatorRunning: null,
    error,
    nodeRunning: null,
    peerCount: null,
    source,
  }));
}
