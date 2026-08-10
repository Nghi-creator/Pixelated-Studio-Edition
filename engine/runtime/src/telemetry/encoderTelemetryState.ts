import fs from "fs";

const MAX_ENCODER_TELEMETRY_BYTES = 64 * 1024;
const DEFAULT_ENCODER_TELEMETRY_STALE_MS = 5_000;

export type EncoderTelemetryState = {
  available: boolean;
  cpuUsed: number | null;
  error: string | null;
  framesDroppedTotal: number | null;
  framesInTotal: number | null;
  framesOutTotal: number | null;
  maxQuantizer: number | null;
  pipelineDelayProxyMs: number | null;
  queueLevelBuffers: number | null;
  targetBitrateKbps: number | null;
  targetFps: number | null;
  updatedAt: string | null;
};

function unavailable(error: string): EncoderTelemetryState {
  return {
    available: false,
    cpuUsed: null,
    error,
    framesDroppedTotal: null,
    framesInTotal: null,
    framesOutTotal: null,
    maxQuantizer: null,
    pipelineDelayProxyMs: null,
    queueLevelBuffers: null,
    targetBitrateKbps: null,
    targetFps: null,
    updatedAt: null,
  };
}

function nullableNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

export function readEncoderTelemetryState(
  filePath: string,
  expectedSessionId: string,
  options: { now?: () => number; staleAfterMs?: number } = {},
): EncoderTelemetryState {
  const now = options.now || Date.now;
  const staleAfterMs =
    options.staleAfterMs ?? DEFAULT_ENCODER_TELEMETRY_STALE_MS;
  try {
    if (fs.statSync(filePath).size > MAX_ENCODER_TELEMETRY_BYTES) {
      return unavailable("Encoder telemetry state is too large.");
    }
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as Record<
      string,
      unknown
    >;
    if (parsed.schemaVersion !== 1 || parsed.sessionId !== expectedSessionId) {
      return unavailable("Encoder telemetry does not match the active session.");
    }
    const updatedAt =
      typeof parsed.updatedAt === "string" ? parsed.updatedAt : null;
    const updatedAtMs = updatedAt ? Date.parse(updatedAt) : NaN;
    if (!Number.isFinite(updatedAtMs) || now() - updatedAtMs > staleAfterMs) {
      return unavailable("Encoder telemetry state is stale.");
    }

    return {
      available: true,
      cpuUsed: nullableNumber(parsed.cpuUsed),
      error: null,
      framesDroppedTotal: nullableNumber(parsed.framesDroppedTotal),
      framesInTotal: nullableNumber(parsed.framesInTotal),
      framesOutTotal: nullableNumber(parsed.framesOutTotal),
      maxQuantizer: nullableNumber(parsed.maxQuantizer),
      pipelineDelayProxyMs: nullableNumber(parsed.pipelineDelayProxyMs),
      queueLevelBuffers: nullableNumber(parsed.queueLevelBuffers),
      targetBitrateKbps: nullableNumber(parsed.targetBitrateKbps),
      targetFps: nullableNumber(parsed.targetFps),
      updatedAt,
    };
  } catch {
    return unavailable("Encoder telemetry state is unavailable.");
  }
}
