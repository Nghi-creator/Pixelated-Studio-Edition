import { useEffect, useState } from "react";
import {
  Clipboard,
  Download,
  ImageDown,
  Radio,
  RotateCcw,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { engineAuthHeaders } from "../../../lib/engine/engineAuth";
import { engineEndpoint } from "../../../lib/engine/engineConfig";
import type { WebRTCTelemetry } from "../../../lib/webrtc/webrtcTelemetry";
import {
  addPacketLossDeltas,
  createStreamTelemetryGraphFilename,
  createStreamTelemetryCsvFilename,
  latestStreamTelemetryGraphSamples,
  renderStreamTelemetryGraphPng,
  STREAM_TELEMETRY_GRAPH_WINDOW_MS,
  streamTelemetrySamplesToCsv,
  type StreamTelemetryCsvSample,
  type StreamTelemetryGraphSample,
} from "../streamTelemetryExport";

type StreamTelemetryPanelProps = {
  gameId: string | undefined;
  gameTitle: string;
  isRecordingCsv: boolean;
  playerMode: "guest" | "host";
  recordedCsvSamples: StreamTelemetryCsvSample[];
  sessionId: string;
  shareUrl: string;
  status: string;
  telemetry: WebRTCTelemetry;
  onClearTelemetryCsv: () => void;
  onClose: () => void;
  onResetTelemetryData: () => void;
  onToggleCsvRecording: () => void;
};

type TelemetrySample = {
  bitrateKbps: number;
  fps: number;
  jitterMs: number;
  packetsLost: number;
};

type FileSystemWritable = {
  close: () => Promise<void>;
  write: (data: Blob) => Promise<void>;
};

type SaveFilePickerWindow = Window &
  typeof globalThis & {
    showSaveFilePicker?: (options: {
      suggestedName: string;
      types: Array<{
        accept: Record<string, string[]>;
        description: string;
      }>;
    }) => Promise<{
      createWritable: () => Promise<FileSystemWritable>;
    }>;
  };

const formatNumber = (value: number | null, digits = 0) =>
  value === null ? "--" : value.toFixed(digits);

const makePoints = (values: number[], width = 240, height = 54) => {
  if (values.length === 0) return "";

  const maximum = Math.max(...values, 1);
  const minimum = Math.min(...values, 0);
  const range = Math.max(maximum - minimum, 1);

  return values
    .map((value, index) => {
      const x = values.length === 1 ? width : (index / (values.length - 1)) * width;
      const y = height - ((value - minimum) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
};

function HistoryChart({
  label,
  primaryLabel,
  primaryValues,
  secondaryLabel,
  secondaryValues,
}: {
  label: string;
  primaryLabel: string;
  primaryValues: number[];
  secondaryLabel?: string;
  secondaryValues?: number[];
}) {
  return (
    <div className="rounded-md border border-synth-border bg-synth-bg/90 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase text-gray-500">
          {label}
        </span>
        <div className="flex items-center gap-3 text-[10px] font-semibold text-gray-500">
          <span className="inline-flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-synth-action-hover" />
            {primaryLabel}
          </span>
          {secondaryLabel && (
            <span className="inline-flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-synth-secondary" />
              {secondaryLabel}
            </span>
          )}
        </div>
      </div>
      <svg
        aria-label={`${label} history`}
        className="h-14 w-full overflow-visible"
        preserveAspectRatio="none"
        role="img"
        viewBox="0 0 240 54"
      >
        <path d="M0 18H240 M0 36H240" stroke="rgba(255,255,255,0.06)" />
        <polyline
          fill="none"
          points={makePoints(primaryValues)}
          stroke="#B00052"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
        {secondaryValues && (
          <polyline
            fill="none"
            points={makePoints(secondaryValues)}
            stroke="#D8A4B5"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
          />
        )}
      </svg>
    </div>
  );
}

function buildTelemetrySnapshot({
  gameId,
  playerMode,
  sessionId,
  shareUrl,
  status,
  telemetry,
}: StreamTelemetryPanelProps) {
  return {
    capturedAt: new Date().toISOString(),
    gameId: gameId || null,
    playerMode,
    sessionId,
    shareUrl,
    status,
    telemetry,
    userAgent: navigator.userAgent,
  };
}

export function StreamTelemetryPanel(props: StreamTelemetryPanelProps) {
  const {
    gameId,
    gameTitle,
    isRecordingCsv,
    onClearTelemetryCsv,
    onClose,
    onResetTelemetryData,
    onToggleCsvRecording,
    recordedCsvSamples,
    sessionId,
    telemetry,
  } = props;
  const [copyState, setCopyState] = useState<
    "copied" | "failed" | "idle" | "saved"
  >("idle");
  const [csvState, setCsvState] = useState<"exported" | "failed" | "idle">(
    "idle",
  );
  const [graphState, setGraphState] = useState<"exported" | "failed" | "idle">(
    "idle",
  );
  const [history, setHistory] = useState<TelemetrySample[]>([]);
  const [packetLossBaseline, setPacketLossBaseline] = useState(
    telemetry.packetsLost,
  );
  const displayedPacketsLost = Math.max(
    0,
    telemetry.packetsLost - packetLossBaseline,
  );
  const latestHistorySample = history.at(-1);

  useEffect(() => {
    if (telemetry.lastUpdatedAt === null) return;

    const sampleTimer = window.setTimeout(() => {
      setHistory((currentHistory) =>
        [
          ...currentHistory,
          {
            bitrateKbps: telemetry.bitrateKbps || 0,
            fps: telemetry.fps || 0,
            jitterMs: telemetry.jitterMs || 0,
            packetsLost: displayedPacketsLost,
          },
        ].slice(-60),
      );
    }, 0);

    return () => window.clearTimeout(sampleTimer);
  }, [
    telemetry.bitrateKbps,
    telemetry.fps,
    telemetry.jitterMs,
    telemetry.lastUpdatedAt,
    displayedPacketsLost,
  ]);

  const copyTelemetry = async () => {
    const snapshot = buildTelemetrySnapshot(props);

    try {
      try {
        const response = await fetch(engineEndpoint("/smoke/telemetry"), {
          body: JSON.stringify(snapshot),
          headers: {
            "Content-Type": "application/json",
            ...engineAuthHeaders(),
          },
          method: "POST",
        });
        if (response.ok) {
          setCopyState("saved");
          window.setTimeout(() => setCopyState("idle"), 1600);
          return;
        }
      } catch {
        // Clipboard export remains available when the local engine is offline.
      }

      await navigator.clipboard.writeText(JSON.stringify(snapshot, null, 2));
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }

    window.setTimeout(() => setCopyState("idle"), 1600);
  };

  const toggleCsvRecording = () => {
    setCsvState("idle");
    onToggleCsvRecording();
  };

  const clearTelemetryCsv = () => {
    setCsvState("idle");
    onClearTelemetryCsv();
  };

  const resetTelemetryData = () => {
    setCopyState("idle");
    setCsvState("idle");
    setGraphState("idle");
    setHistory([]);
    setPacketLossBaseline(telemetry.packetsLost);
    onResetTelemetryData();
  };

  const exportTelemetryCsv = async () => {
    if (recordedCsvSamples.length === 0) return;

    try {
      const csv = streamTelemetrySamplesToCsv(recordedCsvSamples);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const suggestedName = createStreamTelemetryCsvFilename({ gameId, sessionId });
      const pickerWindow = window as SaveFilePickerWindow;

      if (pickerWindow.showSaveFilePicker) {
        const fileHandle = await pickerWindow.showSaveFilePicker({
          suggestedName,
          types: [
            {
              accept: { "text/csv": [".csv"] },
              description: "CSV file",
            },
          ],
        });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
        setCsvState("exported");
        window.setTimeout(() => setCsvState("idle"), 1600);
        return;
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = suggestedName;
      link.click();
      URL.revokeObjectURL(url);
      setCsvState("exported");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setCsvState("failed");
    }

    window.setTimeout(() => setCsvState("idle"), 1600);
  };

  const exportTelemetryGraph = () => {
    const sourceGraphSamples: StreamTelemetryGraphSample[] =
      recordedCsvSamples.length > 0
        ? addPacketLossDeltas(recordedCsvSamples)
        : history.map((sample, index) => ({
            bitrateKbps: sample.bitrateKbps,
            elapsedMs: index * 1000,
            fps: sample.fps,
            jitterMs: sample.jitterMs,
            packetsLostDelta:
              index === 0
                ? sample.packetsLost
                : Math.max(0, sample.packetsLost - history[index - 1].packetsLost),
            packetsLostTotal: sample.packetsLost,
          }));
    const graphSamples = latestStreamTelemetryGraphSamples(sourceGraphSamples);

    const dataUrl = renderStreamTelemetryGraphPng(graphSamples, {
      gameTitle,
      graphWindowSeconds: STREAM_TELEMETRY_GRAPH_WINDOW_MS / 1000,
      playerMode: props.playerMode,
      sampleCount: graphSamples.length,
      status: props.status,
    });
    if (!dataUrl) {
      setGraphState("failed");
      window.setTimeout(() => setGraphState("idle"), 1600);
      return;
    }

    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = createStreamTelemetryGraphFilename({ gameId, sessionId });
    link.click();
    setGraphState("exported");
    window.setTimeout(() => setGraphState("idle"), 1600);
  };

  return (
    <section className="fixed bottom-4 left-4 right-4 z-40 rounded-lg border border-synth-border bg-synth-surface p-3 shadow-card sm:bottom-auto sm:left-auto sm:right-4 sm:top-20 sm:w-72 xl:static xl:w-full">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="inline-flex items-center gap-2 text-sm font-semibold text-gray-200">
          Stream Stats
        </p>
        <button
          aria-label="Hide stream stats"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-synth-border bg-synth-bg text-gray-400 transition hover:bg-synth-elevated hover:text-white"
          onClick={onClose}
          title="Hide stream stats"
          type="button"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-1.5">
        <button
          aria-label="Reset stream telemetry data"
          className="inline-flex h-8 min-w-0 items-center justify-center gap-1 rounded-md border border-synth-border bg-synth-bg px-2 text-xs font-semibold text-gray-300 transition hover:bg-synth-elevated hover:text-white"
          onClick={resetTelemetryData}
          title="Reset stream telemetry data"
          type="button"
        >
          <RotateCcw className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">Reset</span>
        </button>
        <button
          aria-label="Copy stream telemetry JSON"
          className="inline-flex h-8 min-w-0 items-center justify-center gap-1 rounded-md border border-synth-border bg-synth-bg px-2 text-xs font-semibold text-gray-300 transition hover:bg-synth-elevated hover:text-white"
          onClick={copyTelemetry}
          title="Copy stream telemetry JSON"
          type="button"
        >
          <Clipboard className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">
            {copyState === "copied"
              ? "Copied"
              : copyState === "saved"
                ? "Saved"
                : copyState === "failed"
                  ? "Failed"
                  : "Copy"}
          </span>
        </button>
        <button
          aria-label={
            isRecordingCsv
              ? "Stop recording stream telemetry CSV"
              : "Start recording stream telemetry CSV"
          }
          aria-pressed={isRecordingCsv}
          className="inline-flex h-8 min-w-0 items-center justify-center gap-1 rounded-md border border-synth-border bg-synth-bg px-2 text-xs font-semibold text-gray-300 transition hover:bg-synth-elevated hover:text-white"
          onClick={toggleCsvRecording}
          title={
            isRecordingCsv
              ? "Stop recording stream telemetry CSV"
              : "Start recording stream telemetry CSV"
          }
          type="button"
        >
          {isRecordingCsv ? (
            <Square className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <Radio className="h-3.5 w-3.5 shrink-0" />
          )}
          <span className="truncate">{isRecordingCsv ? "Stop" : "CSV"}</span>
        </button>
        <button
          aria-label="Export stream telemetry graph PNG"
          className="inline-flex h-8 min-w-0 items-center justify-center gap-1 rounded-md border border-synth-border bg-synth-bg px-2 text-xs font-semibold text-gray-300 transition hover:bg-synth-elevated hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          disabled={recordedCsvSamples.length === 0 && history.length === 0}
          onClick={exportTelemetryGraph}
          title="Export stream telemetry graph PNG"
          type="button"
        >
          <ImageDown className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">
            {graphState === "exported"
              ? "Done"
              : graphState === "failed"
                  ? "Failed"
                  : "PNG"}
          </span>
        </button>
        <button
          aria-label="Export recorded stream telemetry CSV"
          className="inline-flex h-8 min-w-0 items-center justify-center gap-1 rounded-md border border-synth-border bg-synth-bg px-2 text-xs font-semibold text-gray-300 transition hover:bg-synth-elevated hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          disabled={recordedCsvSamples.length === 0}
          onClick={() => {
            void exportTelemetryCsv();
          }}
          title="Export recorded stream telemetry CSV"
          type="button"
        >
          <Download className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">
            {csvState === "exported"
              ? "Done"
              : csvState === "failed"
                ? "Failed"
                : recordedCsvSamples.length > 0
                  ? String(recordedCsvSamples.length)
                  : "Export"}
          </span>
        </button>
        <button
          aria-label="Clear recorded stream telemetry CSV samples"
          className="inline-flex h-8 min-w-0 items-center justify-center gap-1 rounded-md border border-synth-border bg-synth-bg px-2 text-xs font-semibold text-gray-300 transition hover:bg-synth-elevated hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          disabled={recordedCsvSamples.length === 0 && !isRecordingCsv}
          onClick={clearTelemetryCsv}
          title="Clear recorded stream telemetry CSV samples"
          type="button"
        >
          <Trash2 className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">Clear</span>
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 xl:grid-cols-1 xl:gap-3">
        <div className="rounded-md border border-synth-border bg-synth-bg/90 px-3 py-2 xl:flex xl:items-center xl:justify-between">
          <div className="text-[11px] font-semibold uppercase text-gray-500">
            FPS
          </div>
          <div className="mt-1 text-base font-bold text-white tabular-nums xl:mt-0">
            {formatNumber(latestHistorySample?.fps ?? null)}
          </div>
        </div>
        <div className="rounded-md border border-synth-border bg-synth-bg/90 px-3 py-2 xl:flex xl:items-center xl:justify-between">
          <div className="text-[11px] font-semibold uppercase text-gray-500">
            Bitrate
          </div>
          <div className="mt-1 text-base font-bold text-white tabular-nums xl:mt-0">
            {formatNumber(latestHistorySample?.bitrateKbps ?? null)}{" "}
            <span className="text-[10px] font-medium text-gray-500">kbps</span>
          </div>
        </div>
        <div className="rounded-md border border-synth-border bg-synth-bg/90 px-3 py-2 xl:flex xl:items-center xl:justify-between">
          <div className="text-[11px] font-semibold uppercase text-gray-500">
            ICE
          </div>
          <div className="mt-1 truncate text-sm font-bold capitalize text-white xl:mt-0 xl:max-w-36">
            {telemetry.iceConnectionState}
          </div>
        </div>
        <div className="rounded-md border border-synth-border bg-synth-bg/90 px-3 py-2 xl:flex xl:items-center xl:justify-between">
          <div className="text-[11px] font-semibold uppercase text-gray-500">
            Loss / Jitter
          </div>
          <div className="mt-1 text-base font-bold text-white tabular-nums xl:mt-0">
            {latestHistorySample?.packetsLost ?? displayedPacketsLost}{" "}
            <span className="text-[10px] font-medium text-gray-500">
              / {formatNumber(latestHistorySample?.jitterMs ?? null, 1)} ms
            </span>
          </div>
        </div>
      </div>

      <div className="mt-3 hidden space-y-3 xl:block">
        <HistoryChart
          label="Performance · 60s"
          primaryLabel="FPS"
          primaryValues={history.map((sample) => sample.fps)}
          secondaryLabel="kbps"
          secondaryValues={history.map((sample) => sample.bitrateKbps)}
        />
        <HistoryChart
          label="Network · 60s"
          primaryLabel="Jitter"
          primaryValues={history.map((sample) => sample.jitterMs)}
          secondaryLabel="Loss"
          secondaryValues={history.map((sample) => sample.packetsLost)}
        />

      </div>
    </section>
  );
}
