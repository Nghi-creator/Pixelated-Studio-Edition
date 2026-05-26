export type WebRTCTelemetry = {
  fps: number | null;
  bitrateKbps: number | null;
  packetsLost: number;
  jitterMs: number | null;
  iceConnectionState: RTCIceConnectionState;
  connectionState: RTCPeerConnectionState;
  lastEngineError: string | null;
  lastUpdatedAt: number | null;
};

export const INITIAL_WEBRTC_TELEMETRY: WebRTCTelemetry = {
  fps: null,
  bitrateKbps: null,
  packetsLost: 0,
  jitterMs: null,
  iceConnectionState: "new",
  connectionState: "new",
  lastEngineError: null,
  lastUpdatedAt: null,
};

type InboundRtpStats = RTCStats & {
  bytesReceived?: number;
  framesPerSecond?: number;
  jitter?: number;
  kind?: string;
  mediaType?: string;
  packetsLost?: number;
};

export const startWebRTCTelemetry = (
  peerConnection: RTCPeerConnection,
  onTelemetry: (telemetry: Partial<WebRTCTelemetry>) => void,
) => {
  let previousBytesReceived: number | null = null;
  let previousTimestamp: number | null = null;

  const publishConnectionState = () => {
    onTelemetry({
      iceConnectionState: peerConnection.iceConnectionState,
      connectionState: peerConnection.connectionState,
      lastUpdatedAt: Date.now(),
    });
  };

  const pollStats = async () => {
    const stats = await peerConnection.getStats();
    let inboundBytesReceived = 0;
    let fps: number | null = null;
    let packetsLost = 0;
    let jitterSeconds: number | null = null;
    let newestTimestamp: number | null = null;

    stats.forEach((report) => {
      if (report.type !== "inbound-rtp") return;

      const inbound = report as InboundRtpStats;
      const kind = inbound.kind || inbound.mediaType;

      inboundBytesReceived += inbound.bytesReceived || 0;
      packetsLost += inbound.packetsLost || 0;
      newestTimestamp = Math.max(newestTimestamp || 0, inbound.timestamp);

      if (kind === "video" && typeof inbound.framesPerSecond === "number") {
        fps = inbound.framesPerSecond;
      }

      if (typeof inbound.jitter === "number") {
        jitterSeconds = Math.max(jitterSeconds || 0, inbound.jitter);
      }
    });

    let bitrateKbps: number | null = null;
    if (
      previousBytesReceived !== null &&
      previousTimestamp !== null &&
      newestTimestamp !== null &&
      newestTimestamp > previousTimestamp
    ) {
      const bytesDelta = inboundBytesReceived - previousBytesReceived;
      const secondsDelta = (newestTimestamp - previousTimestamp) / 1000;
      bitrateKbps = Math.max(0, (bytesDelta * 8) / secondsDelta / 1000);
    }

    previousBytesReceived = inboundBytesReceived;
    previousTimestamp = newestTimestamp;

    onTelemetry({
      fps,
      bitrateKbps,
      packetsLost,
      jitterMs: jitterSeconds === null ? null : jitterSeconds * 1000,
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
      console.error("[WebRTC] Failed to collect stream telemetry:", err);
    });
  }, 1000);

  return () => {
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
