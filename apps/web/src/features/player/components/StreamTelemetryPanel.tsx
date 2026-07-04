import { useState } from "react";
import { X } from "lucide-react";
import type { StreamProfile } from "../../../lib/engine/streamProfiles";
import type { WebRTCTelemetry } from "../../../lib/webrtc/webrtcTelemetry";
import { useStreamTelemetryExportActions } from "../hooks/useStreamTelemetryExportActions";
import { useStreamTelemetryHistory } from "../hooks/useStreamTelemetryHistory";
import type { ResearchRunEvent } from "../researchRunEvents";
import type { ResearchRunMetadataForm } from "../researchRunMetadata";
import type { StreamTelemetryCsvSample } from "../streamTelemetryExport";
import { ResearchRunModal } from "./ResearchRunModal";
import { StreamTelemetryControls } from "./StreamTelemetryControls";
import { StreamTelemetryHistoryChart } from "./StreamTelemetryHistoryChart";
import { StreamTelemetrySummary } from "./StreamTelemetrySummary";

type StreamTelemetryPanelProps = {
  gameId: string | undefined;
  gameTitle: string;
  isRecordingCsv: boolean;
  playerMode: "guest" | "host";
  researchEvents: ResearchRunEvent[];
  researchMetadataForm: ResearchRunMetadataForm;
  researchRunId: string;
  recordedCsvSamples: StreamTelemetryCsvSample[];
  sessionId: string;
  shareUrl: string;
  status: string;
  streamProfile: StreamProfile;
  telemetry: WebRTCTelemetry;
  onClearTelemetryCsv: () => void;
  onClose: () => void;
  onResearchMetadataFormChange: (form: ResearchRunMetadataForm) => void;
  onResetTelemetryData: () => void;
  onToggleCsvRecording: () => void;
};

export function StreamTelemetryPanel(props: StreamTelemetryPanelProps) {
  const {
    gameId,
    gameTitle,
    isRecordingCsv,
    onClearTelemetryCsv,
    onClose,
    onResearchMetadataFormChange,
    onResetTelemetryData,
    onToggleCsvRecording,
    researchEvents,
    researchMetadataForm,
    researchRunId,
    recordedCsvSamples,
    sessionId,
    shareUrl,
    status,
    streamProfile,
    telemetry,
  } = props;
  const [isResearchModalOpen, setIsResearchModalOpen] = useState(false);
  const {
    displayedPacketsLost,
    history,
    latestHistorySample,
    resetHistory,
  } = useStreamTelemetryHistory(telemetry);
  const {
    copyState,
    copyTelemetry,
    csvState,
    exportTelemetryCsv,
    exportTelemetryGraph,
    graphState,
    resetCsvState,
    resetExportStates,
  } = useStreamTelemetryExportActions({
    gameId,
    gameTitle,
    history,
    playerMode: props.playerMode,
    recordedCsvSamples,
    sessionId,
    shareUrl,
    status,
    telemetry,
  });

  const toggleCsvRecording = () => {
    resetCsvState();
    onToggleCsvRecording();
  };

  const clearTelemetryCsv = () => {
    resetCsvState();
    onClearTelemetryCsv();
  };

  const resetTelemetryData = () => {
    resetExportStates();
    resetHistory();
    onResetTelemetryData();
  };

  return (
    <section className="fixed bottom-4 left-4 right-4 z-40 rounded-lg border border-synth-border bg-synth-surface p-3 shadow-card sm:bottom-auto sm:left-auto sm:right-4 sm:top-20 sm:w-72 xl:static xl:w-full">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="inline-flex items-center gap-2 text-sm font-semibold text-gray-200">
          Stream Stats
        </p>
        <button
          aria-label="Hide stream stats"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-synth-border bg-synth-bg text-gray-400 transition hover:bg-synth-elevated hover:text-white"
          onClick={onClose}
          title="Hide stream stats"
          type="button"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <StreamTelemetryControls
        copyState={copyState}
        csvState={csvState}
        graphState={graphState}
        hasGraphSamples={recordedCsvSamples.length > 0 || history.length > 0}
        isRecordingCsv={isRecordingCsv}
        onClearTelemetryCsv={clearTelemetryCsv}
        onCopyTelemetry={() => {
          void copyTelemetry();
        }}
        onExportTelemetryCsv={() => {
          void exportTelemetryCsv();
        }}
        onExportTelemetryGraph={exportTelemetryGraph}
        onOpenResearch={() => setIsResearchModalOpen(true)}
        onResetTelemetryData={resetTelemetryData}
        onToggleCsvRecording={toggleCsvRecording}
        recordedCsvSampleCount={recordedCsvSamples.length}
      />

      <StreamTelemetrySummary
        displayedPacketsLost={displayedPacketsLost}
        latestHistorySample={latestHistorySample}
        telemetry={telemetry}
      />

      <div className="mt-3 hidden space-y-3 xl:block">
        <StreamTelemetryHistoryChart
          label="Performance · 60s"
          primaryLabel="FPS"
          primaryValues={history.map((sample) => sample.fps)}
          secondaryLabel="kbps"
          secondaryValues={history.map((sample) => sample.bitrateKbps)}
        />
        <StreamTelemetryHistoryChart
          label="Network · 60s"
          primaryLabel="Jitter"
          primaryValues={history.map((sample) => sample.jitterMs)}
          secondaryLabel="Loss"
          secondaryValues={history.map((sample) => sample.packetsLost)}
        />
      </div>

      {isResearchModalOpen && (
        <ResearchRunModal
          events={researchEvents}
          form={researchMetadataForm}
          gameId={gameId}
          gameTitle={gameTitle}
          onClose={() => setIsResearchModalOpen(false)}
          onFormChange={onResearchMetadataFormChange}
          playerMode={props.playerMode}
          recordedCsvSamples={recordedCsvSamples}
          runId={researchRunId}
          sessionId={sessionId}
          shareUrl={shareUrl}
          status={status}
          streamProfile={streamProfile}
        />
      )}
    </section>
  );
}
