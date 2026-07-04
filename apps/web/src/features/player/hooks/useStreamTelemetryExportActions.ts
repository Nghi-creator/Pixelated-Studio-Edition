import { useState } from "react";
import { engineAuthHeaders } from "../../../lib/engine/engineAuth";
import { engineEndpoint } from "../../../lib/engine/engineConfig";
import type { WebRTCTelemetry } from "../../../lib/webrtc/webrtcTelemetry";
import { renderStreamTelemetryGraphPng } from "../streamTelemetryGraphPng";
import {
  addPacketLossDeltas,
  createStreamTelemetryGraphFilename,
  createStreamTelemetryCsvFilename,
  latestStreamTelemetryGraphSamples,
  STREAM_TELEMETRY_GRAPH_WINDOW_MS,
  streamTelemetrySamplesToCsv,
  type StreamTelemetryCsvSample,
  type StreamTelemetryGraphSample,
} from "../streamTelemetryExport";
import type { StreamTelemetryHistorySample } from "./useStreamTelemetryHistory";

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
}: {
  gameId: string | undefined;
  playerMode: "guest" | "host";
  sessionId: string;
  shareUrl: string;
  status: string;
  telemetry: WebRTCTelemetry;
}) {
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

export function useStreamTelemetryExportActions({
  gameId,
  gameTitle,
  history,
  playerMode,
  recordedCsvSamples,
  sessionId,
  shareUrl,
  status,
  telemetry,
}: {
  gameId: string | undefined;
  gameTitle: string;
  history: StreamTelemetryHistorySample[];
  playerMode: "guest" | "host";
  recordedCsvSamples: StreamTelemetryCsvSample[];
  sessionId: string;
  shareUrl: string;
  status: string;
  telemetry: WebRTCTelemetry;
}) {
  const [copyState, setCopyState] = useState<
    "copied" | "failed" | "idle" | "saved"
  >("idle");
  const [csvState, setCsvState] = useState<"exported" | "failed" | "idle">(
    "idle",
  );
  const [graphState, setGraphState] = useState<"exported" | "failed" | "idle">(
    "idle",
  );

  const resetCsvState = () => setCsvState("idle");

  const resetExportStates = () => {
    setCopyState("idle");
    setCsvState("idle");
    setGraphState("idle");
  };

  const copyTelemetry = async () => {
    const snapshot = buildTelemetrySnapshot({
      gameId,
      playerMode,
      sessionId,
      shareUrl,
      status,
      telemetry,
    });

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
      playerMode,
      sampleCount: graphSamples.length,
      status,
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

  return {
    copyState,
    copyTelemetry,
    csvState,
    exportTelemetryCsv,
    exportTelemetryGraph,
    graphState,
    resetCsvState,
    resetExportStates,
  };
}
