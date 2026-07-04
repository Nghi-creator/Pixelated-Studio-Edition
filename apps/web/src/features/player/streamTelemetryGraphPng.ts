import {
  latestStreamTelemetryGraphSamples,
  STREAM_TELEMETRY_GRAPH_WINDOW_MS,
  type StreamTelemetryGraphSample,
} from "./streamTelemetryExport.ts";

export type StreamTelemetryGraphMetadata = {
  graphWindowSeconds?: number;
  gameTitle: string;
  playerMode: "guest" | "host";
  sampleCount: number;
  status: string;
};

type StreamTelemetryGraphArtifactOptions = {
  gameTitle: string;
  graphWindowMs?: number;
  playerMode: "guest" | "host";
  status: string;
};

function dataUrlToBytes(dataUrl: string) {
  const [, base64 = ""] = dataUrl.split(",");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
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
        plotY +
        plotHeight -
        ((value - range.min) / (range.max - range.min)) * plotHeight;
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
  ctx.fillText(
    `Game: ${ellipsize(metadata.gameTitle || "Unknown game", 64)}`,
    72,
    124,
  );
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

export function createStreamTelemetryGraphPngBytes(
  samples: StreamTelemetryGraphSample[],
  {
    gameTitle,
    graphWindowMs = STREAM_TELEMETRY_GRAPH_WINDOW_MS,
    playerMode,
    status,
  }: StreamTelemetryGraphArtifactOptions,
) {
  const graphSamples = latestStreamTelemetryGraphSamples(samples, graphWindowMs);
  const dataUrl = renderStreamTelemetryGraphPng(graphSamples, {
    gameTitle,
    graphWindowSeconds: graphWindowMs / 1000,
    playerMode,
    sampleCount: graphSamples.length,
    status,
  });

  return dataUrl ? dataUrlToBytes(dataUrl) : null;
}

export function createStreamTelemetryGraphPngBlob(
  samples: StreamTelemetryGraphSample[],
  metadata: StreamTelemetryGraphArtifactOptions,
) {
  const bytes = createStreamTelemetryGraphPngBytes(samples, metadata);
  return bytes ? new Blob([bytes], { type: "image/png" }) : null;
}
