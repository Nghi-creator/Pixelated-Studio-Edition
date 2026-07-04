import { useState } from "react";
import { X } from "lucide-react";
import { engineAuthHeaders } from "../../../lib/engine/engineAuth";
import { engineEndpoint } from "../../../lib/engine/engineConfig";
import type { WebRTCTelemetry } from "../../../lib/webrtc/webrtcTelemetry";
import { useStreamTelemetryHistory } from "../hooks/useStreamTelemetryHistory";
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
import { StreamTelemetryControls } from "./StreamTelemetryControls";
import { StreamTelemetryHistoryChart } from "./StreamTelemetryHistoryChart";
import { StreamTelemetrySummary } from "./StreamTelemetrySummary";

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
  const {
    displayedPacketsLost,
    history,
    latestHistorySample,
    resetHistory,
  } = useStreamTelemetryHistory(telemetry);

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
    resetHistory();
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

      <StreamTelemetryControls
        copyState={copyState}
        csvState={csvState}
        graphState={graphState}
        hasGraphSamples={recordedCsvSamples.length > 0 || history.length > 0}
        isRecordingCsv={isRecordingCsv}
        onClearTelemetryCsv={clearTelemetryCsv}
        onCopyTelemetry={() => {
          void copyTelemetry();
        }}
        onExportTelemetryCsv={() => {
          void exportTelemetryCsv();
        }}
        onExportTelemetryGraph={exportTelemetryGraph}
        onResetTelemetryData={resetTelemetryData}
        onToggleCsvRecording={toggleCsvRecording}
        recordedCsvSampleCount={recordedCsvSamples.length}
      />

      <StreamTelemetrySummary
        displayedPacketsLost={displayedPacketsLost}
        latestHistorySample={latestHistorySample}
        telemetry={telemetry}
      />

      <div className="mt-3 hidden space-y-3 xl:block">
        <StreamTelemetryHistoryChart
          label="Performance · 60s"
          primaryLabel="FPS"
          primaryValues={history.map((sample) => sample.fps)}
          secondaryLabel="kbps"
          secondaryValues={history.map((sample) => sample.bitrateKbps)}
        />
        <StreamTelemetryHistoryChart
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
