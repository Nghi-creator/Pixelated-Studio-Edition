import { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import { loadEngineLaunchFailureMessage } from "./engineContext";
import type { UseWebRTCOptions } from "./types";
import { createWebRTCRetryIdentity } from "./webrtcIdentity";
import type { WebRTCStatus } from "./webrtcSession";
import type { WebRTCTelemetry } from "./webrtcTelemetry";

const BLACK_FRAME_STALL_MESSAGE =
  "The stream connected, but the video stayed black. Retry the stream; if this only happens on cellular data, configure a TURN relay or use Wi-Fi.";

export function useWebRTCRecoveryControls({
  lastMetricSentAtRef,
  metricsDisabledRef,
  onResearchEvent,
  options,
  peerIdRef,
  profileAutoRetriesRemainingRef,
  seamlessRestartRef,
  sessionConflictAutoRetriesRemainingRef,
  setRetryVersion,
  setSessionId,
  setStatus,
  setTelemetry,
}: {
  lastMetricSentAtRef: { current: number };
  metricsDisabledRef: { current: boolean };
  onResearchEvent: UseWebRTCOptions["onResearchEvent"];
  options: Pick<UseWebRTCOptions, "sessionId">;
  peerIdRef: { current: string };
  profileAutoRetriesRemainingRef: { current: number };
  seamlessRestartRef: { current: boolean };
  sessionConflictAutoRetriesRemainingRef: { current: number };
  setRetryVersion: Dispatch<SetStateAction<number>>;
  setSessionId: Dispatch<SetStateAction<string>>;
  setStatus: Dispatch<SetStateAction<WebRTCStatus>>;
  setTelemetry: Dispatch<SetStateAction<WebRTCTelemetry>>;
}) {
  const retry = useCallback(() => {
    onResearchEvent?.("retry_started", {
      reason: "manual_retry",
    });
    const identity = createWebRTCRetryIdentity(Boolean(options.sessionId));
    peerIdRef.current = identity.peerId;
    if (identity.sessionId) setSessionId(identity.sessionId);
    metricsDisabledRef.current = false;
    lastMetricSentAtRef.current = 0;
    seamlessRestartRef.current = false;
    profileAutoRetriesRemainingRef.current = 0;
    sessionConflictAutoRetriesRemainingRef.current = 1;
    setRetryVersion((currentVersion) => currentVersion + 1);
  }, [
    lastMetricSentAtRef,
    metricsDisabledRef,
    onResearchEvent,
    options.sessionId,
    peerIdRef,
    profileAutoRetriesRemainingRef,
    seamlessRestartRef,
    sessionConflictAutoRetriesRemainingRef,
    setRetryVersion,
    setSessionId,
  ]);

  const reportBlackFrameStall = useCallback(() => {
    loadEngineLaunchFailureMessage().then((diagnosticMessage) => {
      onResearchEvent?.("engine_error", {
        message: diagnosticMessage || BLACK_FRAME_STALL_MESSAGE,
        source: "black_frame_stall",
      });
      setTelemetry((currentTelemetry) => ({
        ...currentTelemetry,
        lastEngineError: diagnosticMessage || BLACK_FRAME_STALL_MESSAGE,
        lastUpdatedAt: Date.now(),
      }));
      setStatus("error");
    });
  }, [onResearchEvent, setStatus, setTelemetry]);

  return {
    reportBlackFrameStall,
    retry,
  };
}
