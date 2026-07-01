import type { MutableRefObject } from "react";
import { ApiError, api } from "../api/apiClient";
import {
  INITIAL_WEBRTC_TELEMETRY,
  type WebRTCTelemetry,
} from "./webrtcTelemetry";

type PublishStreamMetricOptions = {
  lastMetricSentAtRef: MutableRefObject<number>;
  metricsDisabledRef: MutableRefObject<boolean>;
  metric: Partial<WebRTCTelemetry>;
  sendIntervalMs: number;
  sessionId: string;
};

export function publishStreamMetric({
  lastMetricSentAtRef,
  metric,
  metricsDisabledRef,
  sendIntervalMs,
  sessionId,
}: PublishStreamMetricOptions) {
  const metricSnapshot = {
    ...INITIAL_WEBRTC_TELEMETRY,
    ...metric,
  };
  const now = Date.now();
  const metricTimestamp = metric.lastUpdatedAt;

  if (
    metricsDisabledRef.current ||
    !metricTimestamp ||
    now - lastMetricSentAtRef.current < sendIntervalMs
  ) {
    return;
  }

  lastMetricSentAtRef.current = now;
  api
    .streamMetric({
      bitrateKbps: metricSnapshot.bitrateKbps,
      connectionState: metricSnapshot.connectionState,
      fps: metricSnapshot.fps,
      iceConnectionState: metricSnapshot.iceConnectionState,
      jitterMs: metricSnapshot.jitterMs,
      packetsLost: metricSnapshot.packetsLost,
      sessionId,
      timestamp: new Date(metricTimestamp).toISOString(),
    })
    .catch((err) => {
      if (err instanceof ApiError && [401, 503].includes(err.status)) {
        metricsDisabledRef.current = true;
        return;
      }

      console.warn("[WebRTC] Failed to send stream metric:", err);
    });
}
