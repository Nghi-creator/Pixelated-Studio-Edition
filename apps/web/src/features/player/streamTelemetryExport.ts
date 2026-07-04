import type { WebRTCTelemetry } from "../../lib/webrtc/webrtcTelemetry";

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

export type StreamTelemetryGraphMetadata = {
  graphWindowSeconds?: number;
  gameTitle: string;
  playerMode: "guest" | "host";
  sampleCount: number;
  status: string;
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

function graphRange(values: number[]) {
  const maximum = Math.max(...values, 1);
  const minimum = Math.min(...values, 0);
  const padding = Math.max((maximum - minimum) * 0.08, 1);
  return {
    max: maximum + padding,
    min: Math.max(0, minimum - padding),
  };
}

function formatAxisValue(value: number) {
  if (Math.abs(value) >= 100) return value.toFixed(0);
  if (Math.abs(value) >= 10) return value.toFixed(1);
  return value.toFixed(2);
}

function ellipsize(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1))}...`;
}

function drawGraphPanel({
  colorA,
  colorB,
  ctx,
  height,
  labelA,
  labelB,
  samples,
  title,
  valueA,
  valueB,
  width,
  x,
  y,
}: {
  colorA: string;
  colorB: string;
  ctx: CanvasRenderingContext2D;
  height: number;
  labelA: string;
  labelB: string;
  samples: StreamTelemetryGraphSample[];
  title: string;
  valueA: (sample: StreamTelemetryGraphSample) => number | null;
  valueB: (sample: StreamTelemetryGraphSample) => number | null;
  width: number;
  x: number;
  y: number;
}) {
  const plotX = x + 84;
  const plotY = y + 104;
  const plotWidth = width - 136;
  const plotHeight = height - 158;
  const seconds = samples.map((sample) => sample.elapsedMs / 1000);
  const maxSecond = Math.max(...seconds, 1);
  const valuesA = samples.map((sample) => valueA(sample) || 0);
  const valuesB = samples.map((sample) => valueB(sample) || 0);
  const rangeA = graphRange(valuesA);
  const rangeB = graphRange(valuesB);

  ctx.fillStyle = "#080708";
  ctx.strokeStyle = "#5D263A";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, 12);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#FFF7FA";
  ctx.font = "700 26px sans-serif";
  ctx.fillText(title, x + 24, y + 34);

  ctx.font = "700 17px sans-serif";
  const legendY = y + 68;
  const legendStartX = x + width / 2 - 120;
  ctx.fillStyle = colorA;
  ctx.fillText(`● ${labelA}`, legendStartX, legendY);
  ctx.fillStyle = colorB;
  ctx.fillText(`● ${labelB}`, legendStartX + 142, legendY);

  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 1;
  ctx.fillStyle = "#9CA3AF";
  ctx.font = "500 13px sans-serif";
  for (let index = 0; index <= 4; index += 1) {
    const gridY = plotY + (plotHeight / 4) * index;
    ctx.beginPath();
    ctx.moveTo(plotX, gridY);
    ctx.lineTo(plotX + plotWidth, gridY);
    ctx.stroke();
    const axisValue = rangeA.max - ((rangeA.max - rangeA.min) / 4) * index;
    ctx.fillText(formatAxisValue(axisValue), x + 20, gridY + 4);
  }

  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.beginPath();
  ctx.moveTo(plotX, plotY);
  ctx.lineTo(plotX, plotY + plotHeight);
  ctx.lineTo(plotX + plotWidth, plotY + plotHeight);
  ctx.stroke();

  ctx.fillStyle = "#9CA3AF";
  ctx.font = "600 14px sans-serif";
  ctx.fillText("Elapsed seconds", plotX + plotWidth / 2 - 54, y + height - 28);

  ctx.font = "500 12px sans-serif";
  for (let index = 0; index <= 3; index += 1) {
    const tickX = plotX + (plotWidth / 3) * index;
    const tickValue = (maxSecond / 3) * index;
    ctx.fillText(formatAxisValue(tickValue), tickX - 8, plotY + plotHeight + 22);
  }

  function drawLine(
    values: number[],
    range: { max: number; min: number },
    color: string,
  ) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    values.forEach((value, index) => {
      const pointX = plotX + (seconds[index] / maxSecond) * plotWidth;
      const pointY =
        plotY + plotHeight - ((value - range.min) / (range.max - range.min)) * plotHeight;
      if (index === 0) {
        ctx.moveTo(pointX, pointY);
        return;
      }
      ctx.lineTo(pointX, pointY);
    });
    ctx.stroke();
  }

  drawLine(valuesA, rangeA, colorA);
  drawLine(valuesB, rangeB, colorB);
}

export function renderStreamTelemetryGraphPng(
  samples: StreamTelemetryGraphSample[],
  metadata: StreamTelemetryGraphMetadata,
) {
  if (samples.length === 0) return null;

  const canvas = document.createElement("canvas");
  canvas.width = 1600;
  canvas.height = 1160;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = "#050505";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#FFF7FA";
  ctx.font = "800 44px sans-serif";
  ctx.fillText("Pixelated Stream Telemetry", 72, 82);

  ctx.fillStyle = "#CFA4B2";
  ctx.font = "600 19px sans-serif";
  ctx.fillText(`Game: ${ellipsize(metadata.gameTitle || "Unknown game", 64)}`, 72, 124);
  ctx.fillText(
    `Mode: ${metadata.playerMode}    Status: ${metadata.status}    Samples: ${metadata.sampleCount}`,
    72,
    154,
  );

  drawGraphPanel({
    colorA: "#B00052",
    colorB: "#D8A4B5",
    ctx,
    height: 360,
    labelA: "FPS",
    labelB: "Bitrate",
    samples,
    title: "Performance",
    valueA: (sample) => sample.fps,
    valueB: (sample) => sample.bitrateKbps,
    width: 1456,
    x: 72,
    y: 230,
  });

  drawGraphPanel({
    colorA: "#B00052",
    colorB: "#D8A4B5",
    ctx,
    height: 360,
    labelA: "Jitter",
    labelB: "Loss delta",
    samples,
    title: "Network",
    valueA: (sample) => sample.jitterMs,
    valueB: (sample) => sample.packetsLostDelta,
    width: 1456,
    x: 72,
    y: 626,
  });

  ctx.fillStyle = "#CFA4B2";
  ctx.font = "600 18px sans-serif";
  ctx.fillText("X axis: elapsed time in seconds.", 72, 1028);
  ctx.fillText("Performance Y axis: FPS and bitrate (kbps).", 72, 1058);
  ctx.fillText(
    "Network Y axis: jitter (ms) and packet loss delta (packets/sample).",
    72,
    1088,
  );
  ctx.fillText(
    "CSV export remains the source of truth for exact numeric values.",
    72,
    1118,
  );
  if (metadata.graphWindowSeconds) {
    ctx.fillText(
      `Graph shows the latest ${metadata.graphWindowSeconds} seconds.`,
      72,
      1148,
    );
  }

  return canvas.toDataURL("image/png");
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
