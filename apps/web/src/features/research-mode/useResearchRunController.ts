import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { StreamProfileId } from "../../lib/engine/streamProfiles";
import type { ResearchRunEventName } from "../player/research/researchRunEvents";
import type { ResearchRunConfig } from "./researchRunConfig";
import {
  createResearchRunControllerState,
  getResearchCompletionInvalidReason,
  getResearchRunRemainingMs,
  researchRunControllerReducer,
} from "./researchRunController";

type RecordResearchEvent = (
  name: ResearchRunEventName,
  details?: Record<string, unknown>,
) => void;

export function useResearchRunController({
  config,
  currentProfileId,
  enabled,
  firstFrameObserved,
  getCompletionSnapshot,
  isConnectionReady,
  isRecording,
  onResetCapture,
  onStartRecording,
  onStopRecording,
  recordEvent,
  requiresComputeTelemetry,
  sessionId,
}: {
  config: ResearchRunConfig;
  currentProfileId: StreamProfileId;
  enabled: boolean;
  firstFrameObserved: boolean;
  getCompletionSnapshot: () => {
    hasUnavailableComputeSamples: boolean;
    sampleCount: number;
    validComputeSampleCount: number;
  };
  isConnectionReady: boolean;
  isRecording: boolean;
  onResetCapture: () => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  recordEvent: RecordResearchEvent;
  requiresComputeTelemetry: boolean;
  sessionId: string;
}) {
  const [state, dispatch] = useReducer(
    researchRunControllerReducer,
    undefined,
    () => createResearchRunControllerState(performance.now()),
  );
  const [nowMs, setNowMs] = useState(() => performance.now());
  const sessionAtReadyRef = useRef<string | null>(null);
  const recordingObservedRef = useRef(false);
  const finishRecording = useCallback(
    (completionKind: "automatic" | "manual") => {
      const completedAt = performance.now();
      const completionSnapshot = getCompletionSnapshot();
      onStopRecording();
      const completedSampleCount = completionSnapshot.sampleCount;
      const invalidReason = getResearchCompletionInvalidReason({
        hasUnavailableComputeSamples:
          completionSnapshot.hasUnavailableComputeSamples,
        requiresComputeTelemetry,
        sampleCount: completedSampleCount,
        validComputeSampleCount: completionSnapshot.validComputeSampleCount,
      });
      if (invalidReason) {
        recordEvent("research_run_invalidated", { reason: invalidReason });
        dispatch({
          nowMs: completedAt,
          reason: invalidReason,
          sampleCount: completedSampleCount,
          type: "invalidate",
        });
        return;
      }
      recordEvent("research_recording_completed", {
        completionKind,
        computeSampleCount: completionSnapshot.validComputeSampleCount,
        sampleCount: completedSampleCount,
      });
      dispatch({
        completionKind,
        nowMs: completedAt,
        sampleCount: completedSampleCount,
        type: "finish_recording",
      });
    }, [
      getCompletionSnapshot,
      onStopRecording,
      recordEvent,
      requiresComputeTelemetry,
    ],
  );

  const invalidate = useCallback(
    (reason: string) => {
      if (isRecording) onStopRecording();
      recordEvent("research_run_invalidated", { reason });
      dispatch({
        nowMs: performance.now(),
        reason,
        sampleCount: getCompletionSnapshot().sampleCount,
        type: "invalidate",
      });
    },
    [getCompletionSnapshot, isRecording, onStopRecording, recordEvent],
  );

  useEffect(() => {
    if (!enabled) return;
    onResetCapture();
    const timeoutId = window.setTimeout(() => {
      dispatch({ nowMs: performance.now(), type: "connect" });
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [enabled, onResetCapture]);

  useEffect(() => {
    if (
      !enabled ||
      state.stage !== "connecting" ||
      !isConnectionReady ||
      !firstFrameObserved ||
      !sessionId
    ) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      sessionAtReadyRef.current = sessionId;
      dispatch({ nowMs: performance.now(), type: "connection_ready" });
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [enabled, firstFrameObserved, isConnectionReady, sessionId, state.stage]);

  useEffect(() => {
    if (!enabled || state.stage !== "ready") return;
    const timeoutId = window.setTimeout(() => {
      const transitionAt = performance.now();
      recordEvent("research_warmup_started", {
        durationMs: config.warmupDurationMs,
      });
      dispatch({ nowMs: transitionAt, type: "start_warmup" });
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [config.warmupDurationMs, enabled, recordEvent, state.stage]);

  useEffect(() => {
    if (!enabled || state.stage !== "warming_up") return;
    const elapsedMs = performance.now() - state.stageStartedAtMs;
    const timeoutId = window.setTimeout(() => {
      const transitionAt = performance.now();
      onStartRecording();
      recordEvent("research_recording_started", {
        durationMs: config.recordingDurationMs,
      });
      dispatch({ nowMs: transitionAt, type: "start_recording" });
    }, Math.max(0, config.warmupDurationMs - elapsedMs));
    return () => window.clearTimeout(timeoutId);
  }, [
    config.recordingDurationMs,
    config.warmupDurationMs,
    enabled,
    onStartRecording,
    recordEvent,
    state.stage,
    state.stageStartedAtMs,
  ]);

  useEffect(() => {
    if (!enabled || state.stage !== "recording") return;
    const elapsedMs = performance.now() - state.stageStartedAtMs;
    const timeoutId = window.setTimeout(() => {
      finishRecording("automatic");
    }, Math.max(0, config.recordingDurationMs - elapsedMs));
    return () => window.clearTimeout(timeoutId);
  }, [
    config.recordingDurationMs,
    enabled,
    finishRecording,
    state.stage,
    state.stageStartedAtMs,
  ]);

  useEffect(() => {
    const isActive = enabled && (
      state.stage === "preparing" ||
      state.stage === "connecting" ||
      state.stage === "ready" ||
      state.stage === "warming_up" ||
      state.stage === "recording");
    if (!isActive) return;
    const intervalId = window.setInterval(() => setNowMs(performance.now()), 250);
    return () => window.clearInterval(intervalId);
  }, [enabled, state.stage]);

  useEffect(() => {
    if (
      !enabled ||
      (state.stage !== "warming_up" && state.stage !== "recording")
    ) return;
    if (currentProfileId !== config.streamProfileId) {
      invalidate("The stream profile changed during the controlled run.");
      return;
    }
    if (!isConnectionReady) {
      invalidate("The stream connection was interrupted during the controlled run.");
      return;
    }
    if (
      sessionAtReadyRef.current &&
      sessionId &&
      sessionId !== sessionAtReadyRef.current
    ) {
      invalidate("The engine session changed during the controlled run.");
    }
  }, [
    config.streamProfileId,
    currentProfileId,
    enabled,
    invalidate,
    isConnectionReady,
    sessionId,
    state.stage,
  ]);

  useEffect(() => {
    if (!enabled || state.stage !== "recording") {
      recordingObservedRef.current = false;
      return;
    }
    if (isRecording) {
      recordingObservedRef.current = true;
      return;
    }
    if (recordingObservedRef.current) {
      invalidate("Telemetry recording stopped before the configured duration.");
    }
  }, [enabled, invalidate, isRecording, state.stage]);

  const stopEarly = useCallback(() => {
    if (state.stage !== "recording") return;
    finishRecording("manual");
  }, [finishRecording, state.stage]);

  const cancel = useCallback(() => {
    if (isRecording) onStopRecording();
    recordEvent("research_run_cancelled");
    dispatch({
      nowMs: performance.now(),
      sampleCount: getCompletionSnapshot().sampleCount,
      type: "cancel",
    });
  }, [getCompletionSnapshot, isRecording, onStopRecording, recordEvent]);

  return {
    cancel,
    nowMs,
    remainingMs: getResearchRunRemainingMs(state, config, nowMs),
    state,
    stopEarly,
  };
}
