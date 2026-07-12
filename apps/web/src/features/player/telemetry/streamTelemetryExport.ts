import type { WebRTCTelemetry } from "../../../lib/webrtc/webrtcTelemetry";

export type StreamTelemetryCsvSample = {
  bitrateKbps: number | null;
  capturedAt: string;
  connectionState: string;
  elapsedMs: number;
  fps: number | null;
  gameId: string | null;
  iceConnectionState: string;
  jitterMs: number | null;
  lastEngineError: string | null;
  packetsLostDelta: number;
  packetsLostTotal: number;
  playerMode: "guest" | "host";
  sessionId: string;
  status: string;
};

export type StreamTelemetryGraphSample = {
  bitrateKbps: number | null;
  elapsedMs: number;
  fps: number | null;
  jitterMs: number | null;
  packetsLostDelta: number;
  packetsLostTotal: number;
};

export const STREAM_TELEMETRY_GRAPH_WINDOW_MS = 60_000;

export const STREAM_TELEMETRY_CSV_HEADERS = [
  "captured_at",
  "elapsed_ms",
  "session_id",
  "game_id",
  "player_mode",
  "status",
  "fps",
  "bitrate_kbps",
  "packets_lost_total",
  "packets_lost_delta",
  "jitter_ms",
  "ice_connection_state",
  "connection_state",
  "last_engine_error",
] as const;

function csvCell(value: number | string | null) {
  if (value === null) return "";
  const text = String(value);
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

export function createTelemetryCsvSample({
  gameId,
  playerMode,
  recordingStartedAt,
  sessionId,
  status,
  telemetry,
}: {
  gameId: string | undefined;
  playerMode: "guest" | "host";
  recordingStartedAt: number;
  sessionId: string;
  status: string;
  telemetry: WebRTCTelemetry;
}): StreamTelemetryCsvSample {
  const capturedAtMs = Date.now();

  return {
    bitrateKbps: telemetry.bitrateKbps,
    capturedAt: new Date(capturedAtMs).toISOString(),
    connectionState: telemetry.connectionState,
    elapsedMs: Math.max(0, capturedAtMs - recordingStartedAt),
    fps: telemetry.fps,
    gameId: gameId || null,
    iceConnectionState: telemetry.iceConnectionState,
    jitterMs: telemetry.jitterMs,
    lastEngineError: telemetry.lastEngineError,
    packetsLostDelta: telemetry.packetsLost,
    packetsLostTotal: telemetry.packetsLost,
    playerMode,
    sessionId,
    status,
  };
}

export function streamTelemetrySamplesToCsv(
  samples: StreamTelemetryCsvSample[],
) {
  const rows = addPacketLossDeltas(samples).map((sample) =>
    [
      sample.capturedAt,
      sample.elapsedMs,
      sample.sessionId,
      sample.gameId,
      sample.playerMode,
      sample.status,
      sample.fps,
      sample.bitrateKbps,
      sample.packetsLostTotal,
      sample.packetsLostDelta,
      sample.jitterMs,
      sample.iceConnectionState,
      sample.connectionState,
      sample.lastEngineError,
    ]
      .map(csvCell)
      .join(","),
  );

  return [STREAM_TELEMETRY_CSV_HEADERS.join(","), ...rows].join("\n");
}

export function addPacketLossDeltas(samples: StreamTelemetryCsvSample[]) {
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

export function latestStreamTelemetryGraphSamples(
  samples: StreamTelemetryGraphSample[],
  windowMs = STREAM_TELEMETRY_GRAPH_WINDOW_MS,
) {
  const latestElapsedMs = samples.at(-1)?.elapsedMs;
  if (latestElapsedMs === undefined) return [];

  const windowStartMs = Math.max(0, latestElapsedMs - windowMs);
  return samples.filter((sample) => sample.elapsedMs >= windowStartMs);
}

export function createStreamTelemetryGraphFilename({
  gameId,
  recordedAt = new Date(),
  sessionId,
}: {
  gameId: string | undefined;
  recordedAt?: Date;
  sessionId: string;
}) {
  return createStreamTelemetryCsvFilename({ gameId, recordedAt, sessionId })
    .replace(/\.csv$/, ".png")
    .replace("pixelated-stream-telemetry", "pixelated-stream-telemetry-graph");
}

export function createStreamTelemetryCsvFilename({
  gameId,
  recordedAt = new Date(),
  sessionId,
}: {
  gameId: string | undefined;
  recordedAt?: Date;
  sessionId: string;
}) {
  const safeName = [gameId || "game", sessionId || "session"]
    .join("-")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  const timestamp = recordedAt.toISOString().replace(/[:.]/g, "-");

  return `pixelated-stream-telemetry-${safeName}-${timestamp}.csv`;
}
