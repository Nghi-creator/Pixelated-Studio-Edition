import {
  ENCODER_RESEARCH_METRIC_KEYS,
  ENGINE_RESEARCH_METRIC_KEYS,
  RESEARCH_TELEMETRY_SCHEMA_VERSION,
  type EncoderResearchMetrics,
  type EngineResearchMetrics,
  type ResearchTelemetrySource,
} from "../../research-mode/researchTelemetryContract.ts";

export type EngineResearchTelemetrySample = EngineResearchMetrics &
  EncoderResearchMetrics & {
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

export type EngineResearchTelemetryResponse = {
  capturedAt: string;
  encoder: EncoderResearchMetrics & {
    available: boolean;
    error: string | null;
    updatedAt: string | null;
  };
  engine: EngineResearchMetrics & {
    cameraRunning: boolean;
    emulatorRunning: boolean;
    nodeRunning: boolean;
    peerCount: number | null;
  };
  schemaVersion: typeof RESEARCH_TELEMETRY_SCHEMA_VERSION;
  sessionId: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function nullableNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

export function parseEngineResearchTelemetryResponse(
  value: unknown,
  expectedSessionId: string,
): EngineResearchTelemetryResponse | null {
  if (!isRecord(value) || !isRecord(value.engine) || !isRecord(value.encoder)) {
    return null;
  }
  if (
    value.schemaVersion !== RESEARCH_TELEMETRY_SCHEMA_VERSION ||
    value.sessionId !== expectedSessionId ||
    typeof value.capturedAt !== "string" ||
    !Number.isFinite(Date.parse(value.capturedAt))
  ) {
    return null;
  }
  const runtimeKind = ["libretro", "native_linux"].includes(
    String(value.engine.runtimeKind),
  )
    ? (value.engine.runtimeKind as EngineResearchMetrics["runtimeKind"])
    : null;
  const engine = {
    cameraCpuPercent: nullableNumber(value.engine.cameraCpuPercent),
    cameraRssMb: nullableNumber(value.engine.cameraRssMb),
    cameraRunning: value.engine.cameraRunning === true,
    cpuCapacityCores: nullableNumber(value.engine.cpuCapacityCores),
    emulatorCpuPercent: nullableNumber(value.engine.emulatorCpuPercent),
    emulatorRssMb: nullableNumber(value.engine.emulatorRssMb),
    emulatorRunning: value.engine.emulatorRunning === true,
    logicalCpuCount: nullableNumber(value.engine.logicalCpuCount),
    nodeCpuPercent: nullableNumber(value.engine.nodeCpuPercent),
    nodeRssMb: nullableNumber(value.engine.nodeRssMb),
    nodeRunning: value.engine.nodeRunning === true,
    peerCount: nullableNumber(value.engine.peerCount),
    runtimeKind,
  };
  const encoder = {
    available: value.encoder.available === true,
    cpuUsed: nullableNumber(value.encoder.cpuUsed),
    error: typeof value.encoder.error === "string" ? value.encoder.error : null,
    framesDroppedTotal: nullableNumber(value.encoder.framesDroppedTotal),
    framesInTotal: nullableNumber(value.encoder.framesInTotal),
    framesOutTotal: nullableNumber(value.encoder.framesOutTotal),
    maxQuantizer: nullableNumber(value.encoder.maxQuantizer),
    pipelineDelayProxyMs: nullableNumber(value.encoder.pipelineDelayProxyMs),
    queueLevelBuffers: nullableNumber(value.encoder.queueLevelBuffers),
    targetBitrateKbps: nullableNumber(value.encoder.targetBitrateKbps),
    targetFps: nullableNumber(value.encoder.targetFps),
    updatedAt:
      typeof value.encoder.updatedAt === "string"
        ? value.encoder.updatedAt
        : null,
  };
  return {
    capturedAt: value.capturedAt,
    encoder,
    engine,
    schemaVersion: RESEARCH_TELEMETRY_SCHEMA_VERSION,
    sessionId: expectedSessionId,
  };
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
  const sampleIdentity = identity({
    capturedAt: response.capturedAt,
    elapsedMs,
    gameId,
    runId,
    sessionId: response.sessionId,
  });
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

export const ENGINE_TELEMETRY_CSV_HEADERS = [
  "captured_at",
  "elapsed_ms",
  "schema_version",
  "run_id",
  "session_id",
  "game_id",
  "source",
  "available",
  "error",
  "node_cpu_percent",
  "node_rss_mb",
  "emulator_cpu_percent",
  "emulator_rss_mb",
  "camera_cpu_percent",
  "camera_rss_mb",
  "logical_cpu_count",
  "cpu_capacity_cores",
  "runtime_kind",
  "node_running",
  "emulator_running",
  "camera_running",
  "peer_count",
  "frames_in_total",
  "frames_out_total",
  "frames_dropped_total",
  "queue_level_buffers",
  "pipeline_delay_proxy_ms",
  "target_bitrate_kbps",
  "target_fps",
  "cpu_used",
  "max_quantizer",
] as const;

function csvCell(value: boolean | number | string | null) {
  if (value === null) return "";
  const text =
    typeof value === "string" && /^[=+\-@]/.test(value)
      ? `'${value}`
      : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function engineResearchTelemetrySamplesToCsv(
  samples: EngineResearchTelemetrySample[],
) {
  const rows = samples.map((sample) =>
    [
      sample.capturedAt,
      sample.elapsedMs,
      sample.schemaVersion,
      sample.runId,
      sample.sessionId,
      sample.gameId,
      sample.source,
      sample.available,
      sample.error,
      ...ENGINE_RESEARCH_METRIC_KEYS.map((field) => sample[field]),
      sample.nodeRunning,
      sample.emulatorRunning,
      sample.cameraRunning,
      sample.peerCount,
      ...ENCODER_RESEARCH_METRIC_KEYS.map((field) => sample[field]),
    ]
      .map(csvCell)
      .join(","),
  );
  return [ENGINE_TELEMETRY_CSV_HEADERS.join(","), ...rows].join("\n");
}
