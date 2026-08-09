import type { ResearchRunConfig } from "./researchRunConfig.ts";

export type ResearchRunStage =
  | "preparing"
  | "connecting"
  | "ready"
  | "warming_up"
  | "recording"
  | "completed"
  | "invalid"
  | "cancelled";

export type ResearchRunControllerState = {
  completionKind: "automatic" | "manual" | null;
  endedAtMs: number | null;
  invalidReason: string | null;
  recordingStartedAtMs: number | null;
  sampleCount: number;
  stage: ResearchRunStage;
  stageStartedAtMs: number;
};

export type ResearchRunControllerEvent =
  | { nowMs: number; type: "connect" }
  | { nowMs: number; type: "connection_ready" }
  | { nowMs: number; type: "start_warmup" }
  | { nowMs: number; type: "start_recording" }
  | {
      completionKind: "automatic" | "manual";
      nowMs: number;
      sampleCount: number;
      type: "finish_recording";
    }
  | { nowMs: number; reason: string; sampleCount: number; type: "invalidate" }
  | { nowMs: number; sampleCount: number; type: "cancel" };

export function createResearchRunControllerState(
  nowMs = performance.now(),
): ResearchRunControllerState {
  return {
    completionKind: null,
    endedAtMs: null,
    invalidReason: null,
    recordingStartedAtMs: null,
    sampleCount: 0,
    stage: "preparing",
    stageStartedAtMs: nowMs,
  };
}

function isTerminal(stage: ResearchRunStage) {
  return stage === "completed" || stage === "invalid" || stage === "cancelled";
}

export function researchRunControllerReducer(
  state: ResearchRunControllerState,
  event: ResearchRunControllerEvent,
): ResearchRunControllerState {
  if (isTerminal(state.stage)) return state;

  if (event.type === "invalidate") {
    return {
      ...state,
      endedAtMs: event.nowMs,
      invalidReason: event.reason,
      sampleCount: event.sampleCount,
      stage: "invalid",
      stageStartedAtMs: event.nowMs,
    };
  }
  if (event.type === "cancel") {
    return {
      ...state,
      endedAtMs: event.nowMs,
      sampleCount: event.sampleCount,
      stage: "cancelled",
      stageStartedAtMs: event.nowMs,
    };
  }
  if (event.type === "connect" && state.stage === "preparing") {
    return { ...state, stage: "connecting", stageStartedAtMs: event.nowMs };
  }
  if (event.type === "connection_ready" && state.stage === "connecting") {
    return { ...state, stage: "ready", stageStartedAtMs: event.nowMs };
  }
  if (event.type === "start_warmup" && state.stage === "ready") {
    return { ...state, stage: "warming_up", stageStartedAtMs: event.nowMs };
  }
  if (event.type === "start_recording" && state.stage === "warming_up") {
    return {
      ...state,
      recordingStartedAtMs: event.nowMs,
      stage: "recording",
      stageStartedAtMs: event.nowMs,
    };
  }
  if (event.type === "finish_recording" && state.stage === "recording") {
    if (event.sampleCount <= 0) {
      return {
        ...state,
        endedAtMs: event.nowMs,
        invalidReason: "Recording completed without telemetry samples.",
        sampleCount: event.sampleCount,
        stage: "invalid",
        stageStartedAtMs: event.nowMs,
      };
    }
    return {
      ...state,
      completionKind: event.completionKind,
      endedAtMs: event.nowMs,
      sampleCount: event.sampleCount,
      stage: "completed",
      stageStartedAtMs: event.nowMs,
    };
  }

  return state;
}

export function getResearchRunRemainingMs(
  state: ResearchRunControllerState,
  config: ResearchRunConfig,
  nowMs: number,
) {
  if (state.stage === "warming_up") {
    return Math.max(0, config.warmupDurationMs - (nowMs - state.stageStartedAtMs));
  }
  if (state.stage === "recording") {
    return Math.max(
      0,
      config.recordingDurationMs - (nowMs - state.stageStartedAtMs),
    );
  }
  return null;
}

export function getResearchRecordingDurationMs(
  state: ResearchRunControllerState,
) {
  if (state.recordingStartedAtMs === null) return 0;
  const end = state.endedAtMs ?? state.stageStartedAtMs;
  return Math.max(0, end - state.recordingStartedAtMs);
}
