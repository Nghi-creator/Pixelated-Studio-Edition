import { useState } from "react";
import { engineAuthHeaders } from "../../../lib/engine/engineAuth";
import { engineEndpoint } from "../../../lib/engine/engineConfig";
import { engineFetch } from "../../../lib/engine/engineRequest";
import type { WebRTCTelemetry } from "../../../lib/webrtc/webrtcTelemetry";
import { downloadBlob } from "../downloadFile";
import {
  createStreamTelemetryCsvFilename,
  streamTelemetrySamplesToCsv,
  type StreamTelemetryCsvSample,
} from "../telemetry/streamTelemetryExport";

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
  playerMode,
  recordedCsvSamples,
  sessionId,
  shareUrl,
  status,
  telemetry,
}: {
  gameId: string | undefined;
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

  const resetCsvState = () => setCsvState("idle");

  const resetExportStates = () => {
    setCopyState("idle");
    setCsvState("idle");
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
        const response = await engineFetch(engineEndpoint("/smoke/telemetry"), {
          body: JSON.stringify(snapshot),
          headers: {
            "Content-Type": "application/json",
            ...engineAuthHeaders(),
          },
          method: "POST",
        }, 4_000);
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
      const result = await downloadBlob(suggestedName, blob);
      if (result === "cancelled") return;
      setCsvState("exported");
    } catch {
      setCsvState("failed");
    }

    window.setTimeout(() => setCsvState("idle"), 1600);
  };

  return {
    copyState,
    copyTelemetry,
    csvState,
    exportTelemetryCsv,
    resetCsvState,
    resetExportStates,
  };
}
