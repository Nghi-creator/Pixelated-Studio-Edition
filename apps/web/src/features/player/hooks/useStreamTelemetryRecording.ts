import { useEffect, useState } from "react";
import type { WebRTCTelemetry } from "../../../lib/webrtc/webrtcTelemetry";
import {
  createTelemetryCsvSample,
  type StreamTelemetryCsvSample,
} from "../telemetry/streamTelemetryExport";

const LONG_TELEMETRY_RECORDING_ROWS = 10_000;

export function useStreamTelemetryRecording({
  gameId,
  playerMode,
  sessionId,
  status,
  telemetry,
}: {
  gameId: string | undefined;
  playerMode: "guest" | "host";
  sessionId: string;
  status: string;
  telemetry: WebRTCTelemetry;
}) {
  const [isRecordingCsv, setIsRecordingCsv] = useState(false);
  const [recordedCsvSamples, setRecordedCsvSamples] = useState<
    StreamTelemetryCsvSample[]
  >([]);
  const [recordingStartedAt, setRecordingStartedAt] = useState<number | null>(
    null,
  );

  useEffect(() => {
    if (!isRecordingCsv || recordingStartedAt === null) return;
    if (telemetry.lastUpdatedAt === null) return;

    const sampleTimer = window.setTimeout(() => {
      setRecordedCsvSamples((samples) => [
        ...samples,
        createTelemetryCsvSample({
          gameId,
          playerMode,
          recordingStartedAt,
          sessionId,
          status,
          telemetry: {
            bitrateKbps: telemetry.bitrateKbps,
            connectionState: telemetry.connectionState,
            fps: telemetry.fps,
            iceConnectionState: telemetry.iceConnectionState,
            jitterMs: telemetry.jitterMs,
            lastEngineError: telemetry.lastEngineError,
            lastUpdatedAt: telemetry.lastUpdatedAt,
            packetsLost: telemetry.packetsLost,
          },
        }),
      ]);
    }, 0);

    return () => window.clearTimeout(sampleTimer);
  }, [
    telemetry.bitrateKbps,
    telemetry.connectionState,
    telemetry.fps,
    telemetry.iceConnectionState,
    telemetry.jitterMs,
    telemetry.lastEngineError,
    telemetry.lastUpdatedAt,
    telemetry.packetsLost,
    gameId,
    isRecordingCsv,
    playerMode,
    recordingStartedAt,
    sessionId,
    status,
  ]);

  const toggleCsvRecording = () => {
    if (isRecordingCsv) {
      setIsRecordingCsv(false);
      setRecordingStartedAt(null);
      return;
    }

    setRecordedCsvSamples([]);
    setRecordingStartedAt(Date.now());
    setIsRecordingCsv(true);
  };

  const clearTelemetryCsv = () => {
    setIsRecordingCsv(false);
    setRecordedCsvSamples([]);
    setRecordingStartedAt(null);
  };

  const recordedCsvRowLabel = `${recordedCsvSamples.length} row${
    recordedCsvSamples.length === 1 ? "" : "s"
  }`;
  const csvStatusText =
    recordedCsvSamples.length >= LONG_TELEMETRY_RECORDING_ROWS
      ? `Long CSV recording - ${recordedCsvRowLabel}`
      : isRecordingCsv
        ? `CSV recording - ${recordedCsvRowLabel}`
        : `CSV ready - ${recordedCsvRowLabel}`;
  const csvStatusTitle =
    recordedCsvSamples.length >= LONG_TELEMETRY_RECORDING_ROWS
      ? "Long recording: CSV keeps the full dataset until you export or clear it."
      : undefined;

  return {
    clearTelemetryCsv,
    csvStatusText,
    csvStatusTitle,
    isRecordingCsv,
    recordedCsvSamples,
    toggleCsvRecording,
  };
}
