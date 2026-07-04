import { useEffect, useState } from "react";
import type { WebRTCTelemetry } from "../../../lib/webrtc/webrtcTelemetry";

export type StreamTelemetryHistorySample = {
  bitrateKbps: number;
  fps: number;
  jitterMs: number;
  packetsLost: number;
};

export function useStreamTelemetryHistory(telemetry: WebRTCTelemetry) {
  const [history, setHistory] = useState<StreamTelemetryHistorySample[]>([]);
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

  const resetHistory = () => {
    setHistory([]);
    setPacketLossBaseline(telemetry.packetsLost);
  };

  return {
    displayedPacketsLost,
    history,
    latestHistorySample,
    resetHistory,
  };
}
