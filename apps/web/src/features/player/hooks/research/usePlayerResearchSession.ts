import { useCallback, useState } from "react";
import type {
  StreamProfile,
  StreamProfileId,
} from "../../../../lib/engine/streamProfiles";
import type { WebRTCTelemetry } from "../../../../lib/webrtc/telemetry/webrtcTelemetry";
import type { PlayerExperience } from "../../../research-mode/researchRoutes";
import {
  createDefaultResearchRunConfig,
  type ResearchRunConfig,
} from "../../../research-mode/researchRunConfig";
import { useResearchRunController } from "../../../research-mode/useResearchRunController";
import { useEngineResearchTelemetryRecording } from "../telemetry/useEngineResearchTelemetryRecording";
import { useStreamTelemetryRecording } from "../telemetry/useStreamTelemetryRecording";
import { useResearchRunExports } from "./useResearchRunExports";
import type { useResearchRunState } from "./useResearchRunState";

type ResearchRunState = ReturnType<typeof useResearchRunState>;

export function usePlayerResearchSession({
  experience,
  firstFrameObserved,
  gameId,
  gameTitle,
  playerMode,
  researchConfig,
  researchState,
  sessionId,
  shareUrl,
  status,
  streamProfile,
  streamProfileId,
  telemetry,
}: {
  experience: PlayerExperience;
  firstFrameObserved: boolean;
  gameId: string | undefined;
  gameTitle: string;
  playerMode: "guest" | "host";
  researchConfig: ResearchRunConfig | null;
  researchState: ResearchRunState;
  sessionId: string;
  shareUrl: string;
  status: string;
  streamProfile: StreamProfile;
  streamProfileId: StreamProfileId;
  telemetry: WebRTCTelemetry;
}) {
  const recording = useStreamTelemetryRecording({
    gameId,
    playerMode,
    sessionId,
    status,
    telemetry,
  });
  const { clearTelemetryCsv } = recording;
  const { clearEvents } = researchState;
  const resetCapture = useCallback(() => {
    clearTelemetryCsv();
    clearEvents();
  }, [clearEvents, clearTelemetryCsv]);
  const [config] = useState(() =>
    researchConfig || createDefaultResearchRunConfig(gameId || ""),
  );
  const engineTelemetry = useEngineResearchTelemetryRecording({
    enabled: experience === "research",
    gameId: gameId || "",
    isRecording: recording.isRecordingCsv,
    runId: researchState.runId,
    sessionId,
  });
  const controller = useResearchRunController({
    config,
    computeSampleCount: engineTelemetry.validComputeSampleCount,
    hasUnavailableComputeSamples:
      engineTelemetry.hasUnavailableComputeSamples,
    currentProfileId: streamProfileId,
    enabled: experience === "research",
    firstFrameObserved,
    isConnectionReady:
      status === "playing" &&
      telemetry.connectionState === "connected" &&
      telemetry.iceConnectionState === "connected",
    isRecording: recording.isRecordingCsv,
    onResetCapture: resetCapture,
    onStartRecording: recording.startCsvRecording,
    onStopRecording: recording.stopCsvRecording,
    recordEvent: researchState.recordEvent,
    requiresComputeTelemetry:
      experience === "research" && config.scenario !== "browser_only_baseline",
    sampleCount: recording.recordedCsvSamples.length,
    sessionId,
  });
  const exports = useResearchRunExports({
    baselineForm: researchState.baselineForm,
    comparisonCaseId: config.comparisonCaseId,
    events: researchState.events,
    form: researchState.metadataForm,
    gameId,
    gameTitle,
    history: [],
    playerMode,
    phase: config.phase,
    recordedEngineSamples: engineTelemetry.recordedEngineSamples,
    recordedCsvSnapshot: {
      revision: recording.recordedCsvRevision,
      samples: recording.recordedCsvSamples,
    },
    runId: researchState.runId,
    sessionId,
    shareUrl,
    status,
    streamProfile,
  });

  return {
    baselineForm: researchState.baselineForm,
    config,
    controller,
    engineTelemetry,
    exports,
    recording,
    setBaselineForm: researchState.setBaselineForm,
  };
}

export type PlayerResearchSession = ReturnType<
  typeof usePlayerResearchSession
>;
