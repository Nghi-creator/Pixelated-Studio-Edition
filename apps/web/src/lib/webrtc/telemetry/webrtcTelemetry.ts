export type WebRTCTelemetry = {
  availableIncomingBitrateKbps: number | null;
  fps: number | null;
  bitrateKbps: number | null;
  decodeTimeMeanMs: number | null;
  framesDecoded: number | null;
  framesDropped: number | null;
  freezeCount: number | null;
  freezeDurationTotalMs: number | null;
  jitterBufferDelayMeanMs: number | null;
  keyFramesDecoded: number | null;
  packetsLost: number;
  jitterMs: number | null;
  roundTripTimeMs: number | null;
  iceConnectionState: RTCIceConnectionState;
  connectionState: RTCPeerConnectionState;
  lastEngineError: string | null;
  lastUpdatedAt: number | null;
};

export const INITIAL_WEBRTC_TELEMETRY: WebRTCTelemetry = {
  availableIncomingBitrateKbps: null,
  fps: null,
  bitrateKbps: null,
  decodeTimeMeanMs: null,
  framesDecoded: null,
  framesDropped: null,
  freezeCount: null,
  freezeDurationTotalMs: null,
  jitterBufferDelayMeanMs: null,
  keyFramesDecoded: null,
  packetsLost: 0,
  jitterMs: null,
  roundTripTimeMs: null,
  iceConnectionState: "new",
  connectionState: "new",
  lastEngineError: null,
  lastUpdatedAt: null,
};

import {
  createWebRTCStatsParserState,
  parseWebRTCStats,
  type WebRTCStatsRecord,
} from "./webrtcStatsParser.ts";

export const startWebRTCTelemetry = (
  peerConnection: RTCPeerConnection,
  onTelemetry: (telemetry: Partial<WebRTCTelemetry>) => void,
) => {
  let parserState = createWebRTCStatsParserState();
  let pollInFlight = false;
  let stopped = false;

  const publishConnectionState = () => {
    if (stopped) return;
    onTelemetry({
      iceConnectionState: peerConnection.iceConnectionState,
      connectionState: peerConnection.connectionState,
      lastUpdatedAt: Date.now(),
    });
  };

  const pollStats = async () => {
    if (pollInFlight || stopped) return;
    pollInFlight = true;
    let stats: RTCStatsReport;
    try {
      stats = await peerConnection.getStats();
    } finally {
      pollInFlight = false;
    }
    if (stopped) return;
    const reports: WebRTCStatsRecord[] = [];
    stats.forEach((report) => {
      reports.push(report as WebRTCStatsRecord);
    });
    const parsed = parseWebRTCStats(reports, parserState);
    parserState = parsed.state;

    onTelemetry({
      ...parsed.metrics,
      iceConnectionState: peerConnection.iceConnectionState,
      connectionState: peerConnection.connectionState,
      lastUpdatedAt: Date.now(),
    });
  };

  peerConnection.addEventListener(
    "iceconnectionstatechange",
    publishConnectionState,
  );
  peerConnection.addEventListener("connectionstatechange", publishConnectionState);

  publishConnectionState();
  const intervalId = window.setInterval(() => {
    pollStats().catch((err) => {
      if (!stopped) {
        console.error("[WebRTC] Failed to collect stream telemetry:", err);
      }
    });
  }, 1000);

  return () => {
    stopped = true;
    window.clearInterval(intervalId);
    peerConnection.removeEventListener(
      "iceconnectionstatechange",
      publishConnectionState,
    );
    peerConnection.removeEventListener(
      "connectionstatechange",
      publishConnectionState,
    );
  };
};
