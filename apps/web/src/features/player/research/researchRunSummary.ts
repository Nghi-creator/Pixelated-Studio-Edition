import type {
  ResearchRunEvent,
  ResearchRunEventName,
} from "./researchRunEvents";
import {
  addPacketLossDeltas,
  type StreamTelemetryCsvSample,
} from "../telemetry/streamTelemetryExport.ts";
import type { EngineResearchTelemetrySample } from "../telemetry/engineResearchTelemetry";

export const RESEARCH_RUN_SUMMARY_SCHEMA_VERSION = 2 as const;

export type ResearchRunMetricSummary = {
  max: number | null;
  mean: number | null;
  median: number | null;
  min: number | null;
  p95: number | null;
};

export type ResearchRunSummary = {
  eventCount: number;
  generatedAt: string;
  metrics: {
    bitrateKbps: ResearchRunMetricSummary;
    decodeTimeMeanMs: ResearchRunMetricSummary;
    fps: ResearchRunMetricSummary;
    jitterMs: ResearchRunMetricSummary;
    jitterBufferDelayMeanMs: ResearchRunMetricSummary;
    roundTripTimeMs: ResearchRunMetricSummary;
  };
  compute: {
    cameraCpuPercent: ResearchRunMetricSummary;
    emulatorCpuPercent: ResearchRunMetricSummary;
    encoderFramesDroppedLatest: number | null;
    encoderQueueLevelBuffers: ResearchRunMetricSummary;
    nodeCpuPercent: ResearchRunMetricSummary;
  };
  packetLoss: {
    lossPerMinute: number | null;
    totalDelta: number;
    totalLatest: number;
  };
  recording: {
    durationMs: number;
    sampleCount: number;
  };
  runId: string;
  schemaVersion: typeof RESEARCH_RUN_SUMMARY_SCHEMA_VERSION;
  sessionId: string;
  stability: {
    disconnectCount: number;
    recoveredCount: number;
    stallCount: number;
  };
  timings: {
    firstFrameMs: number | null;
    pythonReadyMs: number | null;
    startGameMs: number | null;
  };
  validity: {
    isValid: boolean;
    reasons: string[];
    sources: {
      browserWebrtc: { availableSampleCount: number; sampleCount: number };
      encoderPipeline: { availableSampleCount: number; sampleCount: number };
      engineRuntime: { availableSampleCount: number; sampleCount: number };
    };
  };
};

function roundStat(value: number) {
  return Number(value.toFixed(3));
}

function metricSummary(values: Array<number | null>): ResearchRunMetricSummary {
  const numericValues = values
    .filter((value): value is number => typeof value === "number")
    .sort((left, right) => left - right);

  if (numericValues.length === 0) {
    return {
      max: null,
      mean: null,
      median: null,
      min: null,
      p95: null,
    };
  }

  const middleIndex = Math.floor(numericValues.length / 2);
  const median =
    numericValues.length % 2 === 0
      ? (numericValues[middleIndex - 1] + numericValues[middleIndex]) / 2
      : numericValues[middleIndex];
  const p95Index = Math.ceil(numericValues.length * 0.95) - 1;
  const mean =
    numericValues.reduce((total, value) => total + value, 0) /
    numericValues.length;

  return {
    max: roundStat(numericValues[numericValues.length - 1]),
    mean: roundStat(mean),
    median: roundStat(median),
    min: roundStat(numericValues[0]),
    p95: roundStat(numericValues[Math.max(0, p95Index)]),
  };
}

function countEvents(
  events: ResearchRunEvent[],
  predicate: (event: ResearchRunEvent) => boolean,
) {
  return events.filter(predicate).length;
}

function findFirstEventElapsedMs(
  events: ResearchRunEvent[],
  name: ResearchRunEventName,
) {
  return events.find((event) => event.name === name)?.elapsedMs ?? null;
}

export function createResearchRunSummary({
  events,
  generatedAt = new Date(),
  engineSamples = [],
  requiresComputeTelemetry = false,
  runId,
  samples,
  sessionId,
}: {
  events: ResearchRunEvent[];
  engineSamples?: EngineResearchTelemetrySample[];
  generatedAt?: Date;
  requiresComputeTelemetry?: boolean;
  runId: string;
  samples: StreamTelemetryCsvSample[];
  sessionId: string;
}): ResearchRunSummary {
  const samplesWithDeltas = addPacketLossDeltas(samples);
  const firstSample = samplesWithDeltas.at(0);
  const latestSample = samplesWithDeltas.at(-1);
  const durationMs =
    firstSample && latestSample
      ? Math.max(0, latestSample.elapsedMs - firstSample.elapsedMs)
      : 0;
  const totalPacketLossDelta = samplesWithDeltas.reduce(
    (total, sample) => total + sample.packetsLostDelta,
    0,
  );
  const durationMinutes = durationMs / 60_000;
  const engineRuntimeSamples = engineSamples.filter(
    (sample) => sample.source === "engine_runtime",
  );
  const encoderPipelineSamples = engineSamples.filter(
    (sample) => sample.source === "encoder_pipeline",
  );
  const availableEngineSamples = engineRuntimeSamples.filter(
    (sample) => sample.available,
  );
  const availableEncoderSamples = encoderPipelineSamples.filter(
    (sample) => sample.available,
  );
  const validityReasons: string[] = [];
  if (samples.length === 0) {
    validityReasons.push("Browser WebRTC telemetry is unavailable.");
  } else if (samples.length < 2) {
    validityReasons.push("Browser WebRTC telemetry requires at least two samples.");
  }
  if (requiresComputeTelemetry && availableEngineSamples.length === 0) {
    validityReasons.push("Engine runtime telemetry is unavailable.");
  } else if (
    requiresComputeTelemetry &&
    availableEngineSamples.length !== engineRuntimeSamples.length
  ) {
    validityReasons.push("Engine runtime telemetry has unavailable samples.");
  }
  if (requiresComputeTelemetry && availableEncoderSamples.length === 0) {
    validityReasons.push("Encoder pipeline telemetry is unavailable.");
  } else if (
    requiresComputeTelemetry &&
    availableEncoderSamples.length !== encoderPipelineSamples.length
  ) {
    validityReasons.push("Encoder pipeline telemetry has unavailable samples.");
  }

  return {
    compute: {
      cameraCpuPercent: metricSummary(
        availableEngineSamples.map((sample) => sample.cameraCpuPercent),
      ),
      emulatorCpuPercent: metricSummary(
        availableEngineSamples.map((sample) => sample.emulatorCpuPercent),
      ),
      encoderFramesDroppedLatest:
        availableEncoderSamples.at(-1)?.framesDroppedTotal ?? null,
      encoderQueueLevelBuffers: metricSummary(
        availableEncoderSamples.map((sample) => sample.queueLevelBuffers),
      ),
      nodeCpuPercent: metricSummary(
        availableEngineSamples.map((sample) => sample.nodeCpuPercent),
      ),
    },
    eventCount: events.length,
    generatedAt: generatedAt.toISOString(),
    metrics: {
      bitrateKbps: metricSummary(samples.map((sample) => sample.bitrateKbps)),
      decodeTimeMeanMs: metricSummary(
        samples.map((sample) => sample.decodeTimeMeanMs),
      ),
      fps: metricSummary(samples.map((sample) => sample.fps)),
      jitterMs: metricSummary(samples.map((sample) => sample.jitterMs)),
      jitterBufferDelayMeanMs: metricSummary(
        samples.map((sample) => sample.jitterBufferDelayMeanMs),
      ),
      roundTripTimeMs: metricSummary(
        samples.map((sample) => sample.roundTripTimeMs),
      ),
    },
    packetLoss: {
      lossPerMinute:
        durationMinutes > 0
          ? roundStat(totalPacketLossDelta / durationMinutes)
          : null,
      totalDelta: totalPacketLossDelta,
      totalLatest: latestSample?.packetsLostTotal ?? 0,
    },
    recording: {
      durationMs,
      sampleCount: samples.length,
    },
    runId,
    schemaVersion: RESEARCH_RUN_SUMMARY_SCHEMA_VERSION,
    sessionId,
    stability: {
      disconnectCount: countEvents(
        events,
        (event) => event.name === "connection_disconnected",
      ),
      recoveredCount: countEvents(
        events,
        (event) => event.name === "connection_recovered",
      ),
      stallCount: countEvents(
        events,
        (event) =>
          event.name === "engine_error" &&
          event.details?.source === "black_frame_stall",
      ),
    },
    timings: {
      firstFrameMs: findFirstEventElapsedMs(events, "first_non_black_frame"),
      pythonReadyMs: findFirstEventElapsedMs(events, "python_ready"),
      startGameMs: findFirstEventElapsedMs(events, "start_game_emitted"),
    },
    validity: {
      isValid: validityReasons.length === 0,
      reasons: validityReasons,
      sources: {
        browserWebrtc: {
          availableSampleCount: samples.length,
          sampleCount: samples.length,
        },
        encoderPipeline: {
          availableSampleCount: availableEncoderSamples.length,
          sampleCount: encoderPipelineSamples.length,
        },
        engineRuntime: {
          availableSampleCount: availableEngineSamples.length,
          sampleCount: engineRuntimeSamples.length,
        },
      },
    },
  };
}

export function researchRunSummaryToJson(summary: ResearchRunSummary) {
  return `${JSON.stringify(summary, null, 2)}\n`;
}

export function createResearchRunSummaryFilename({
  gameId,
  recordedAt = new Date(),
  runId,
}: {
  gameId: string | undefined;
  recordedAt?: Date;
  runId: string;
}) {
  return createPlayerArtifactFilename({
    extension: "json",
    identity: [gameId || "game", runId],
    prefix: "pixelated-research-summary",
    recordedAt,
  });
}
import { createPlayerArtifactFilename } from "../artifactFilename.ts";
