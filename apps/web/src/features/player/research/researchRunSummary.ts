import type {
  ResearchRunEvent,
  ResearchRunEventName,
} from "./researchRunEvents";
import type { StreamTelemetryCsvSample } from "../telemetry/streamTelemetryExport";

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
    fps: ResearchRunMetricSummary;
    jitterMs: ResearchRunMetricSummary;
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

function addPacketLossDeltas(samples: StreamTelemetryCsvSample[]) {
  let previousTotal = 0;

  return samples.map((sample, index) => {
    const packetsLostDelta =
      index === 0
        ? sample.packetsLostTotal
        : Math.max(0, sample.packetsLostTotal - previousTotal);
    previousTotal = sample.packetsLostTotal;

    return {
      ...sample,
      packetsLostDelta,
    };
  });
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
  runId,
  samples,
  sessionId,
}: {
  events: ResearchRunEvent[];
  generatedAt?: Date;
  runId: string;
  samples: StreamTelemetryCsvSample[];
  sessionId: string;
}): ResearchRunSummary {
  const samplesWithDeltas = addPacketLossDeltas(samples);
  const latestSample = samplesWithDeltas.at(-1);
  const durationMs = Math.max(0, latestSample?.elapsedMs ?? 0);
  const totalPacketLossDelta = samplesWithDeltas.reduce(
    (total, sample) => total + sample.packetsLostDelta,
    0,
  );
  const durationMinutes = durationMs / 60_000;

  return {
    eventCount: events.length,
    generatedAt: generatedAt.toISOString(),
    metrics: {
      bitrateKbps: metricSummary(samples.map((sample) => sample.bitrateKbps)),
      fps: metricSummary(samples.map((sample) => sample.fps)),
      jitterMs: metricSummary(samples.map((sample) => sample.jitterMs)),
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
  const safeName = [gameId || "game", runId]
    .join("-")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  const timestamp = recordedAt.toISOString().replace(/[:.]/g, "-");

  return `pixelated-research-summary-${safeName}-${timestamp}.json`;
}
