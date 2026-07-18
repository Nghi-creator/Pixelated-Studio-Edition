import { useEffect, useRef, useState } from "react";
import type { WebRTCTelemetry } from "../../../lib/webrtc/webrtcTelemetry";
import {
  createTelemetryCsvSample,
  type StreamTelemetryCsvSample,
} from "../telemetry/streamTelemetryExport";

const LONG_TELEMETRY_RECORDING_ROWS = 10_000;
const MAX_TELEMETRY_RECORDING_ROWS = 100_000;

class TelemetryRecordingBuffer {
  private values: StreamTelemetryCsvSample[] = [];

  append(sample: StreamTelemetryCsvSample) {
    this.values.push(sample);
  }

  clear() {
    this.values = [];
  }

  get samples() {
    return this.values;
  }
}

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
  const [recordingBuffer] = useState(() => new TelemetryRecordingBuffer());
  const [recordedCsvRevision, setRecordedCsvRevision] = useState(0);
  const [recordingStartedAt, setRecordingStartedAt] = useState<number | null>(
    null,
  );
  const recordedRowCountRef = useRef(0);

  useEffect(() => {
    if (!isRecordingCsv || recordingStartedAt === null) return;
    if (telemetry.lastUpdatedAt === null) return;

    const sampleTimer = window.setTimeout(() => {
      if (recordedRowCountRef.current >= MAX_TELEMETRY_RECORDING_ROWS) return;
      recordingBuffer.append(
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
      );
      recordedRowCountRef.current += 1;
      setRecordedCsvRevision((revision) => revision + 1);
      if (recordedRowCountRef.current >= MAX_TELEMETRY_RECORDING_ROWS) {
        setIsRecordingCsv(false);
        setRecordingStartedAt(null);
      }
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
    recordingBuffer,
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

    recordingBuffer.clear();
    recordedRowCountRef.current = 0;
    setRecordedCsvRevision((revision) => revision + 1);
    setRecordingStartedAt(Date.now());
    setIsRecordingCsv(true);
  };

  const clearTelemetryCsv = () => {
    setIsRecordingCsv(false);
    recordingBuffer.clear();
    recordedRowCountRef.current = 0;
    setRecordedCsvRevision((revision) => revision + 1);
    setRecordingStartedAt(null);
  };

  const recordedCsvSamples = recordingBuffer.samples;
  const recordedCsvRowLabel = `${recordedCsvSamples.length} row${
    recordedCsvSamples.length === 1 ? "" : "s"
  }`;
  const csvStatusText =
    recordedCsvSamples.length >= MAX_TELEMETRY_RECORDING_ROWS
      ? `CSV limit reached - ${recordedCsvRowLabel}`
      : recordedCsvSamples.length >= LONG_TELEMETRY_RECORDING_ROWS
      ? `Long CSV recording - ${recordedCsvRowLabel}`
      : isRecordingCsv
        ? `CSV recording - ${recordedCsvRowLabel}`
        : `CSV ready - ${recordedCsvRowLabel}`;
  const csvStatusTitle =
    recordedCsvSamples.length >= MAX_TELEMETRY_RECORDING_ROWS
      ? "Recording stopped at the 100,000-row browser safety limit. Export or clear it before starting another recording."
      : recordedCsvSamples.length >= LONG_TELEMETRY_RECORDING_ROWS
      ? "Long recording: CSV keeps the full dataset until you export or clear it."
      : undefined;

  return {
    clearTelemetryCsv,
    csvStatusText,
    csvStatusTitle,
    isRecordingCsv,
    recordedCsvSamples,
    recordedCsvRevision,
    toggleCsvRecording,
  };
}
