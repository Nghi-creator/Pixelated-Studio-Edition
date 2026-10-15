import { RESEARCH_TELEMETRY_SCHEMA_VERSION, type EncoderResearchMetrics, type EngineResearchMetrics } from "../../research-mode/researchTelemetryContract.ts";

export type EngineResearchTelemetryResponse = {
  sampleSequence?: number;
  sampleIntervalMs?: number | null;
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
    sampleSequence: nullableNumber(value.sampleSequence) ?? undefined,
    sampleIntervalMs: nullableNumber(value.sampleIntervalMs),
    capturedAt: value.capturedAt,
    encoder,
    engine,
    schemaVersion: RESEARCH_TELEMETRY_SCHEMA_VERSION,
    sessionId: expectedSessionId,
  };
}

