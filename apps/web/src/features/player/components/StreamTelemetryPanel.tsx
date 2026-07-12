import { lazy, Suspense, useState } from "react";
import { X } from "lucide-react";
import type { StreamProfile } from "../../../lib/engine/streamProfiles";
import type { WebRTCTelemetry } from "../../../lib/webrtc/webrtcTelemetry";
import { useStreamTelemetryExportActions } from "../hooks/useStreamTelemetryExportActions";
import { useStreamTelemetryHistory } from "../hooks/useStreamTelemetryHistory";
import type { ResearchBaselineForm } from "../research/researchBaseline";
import type { ResearchRunEvent } from "../research/researchRunEvents";
import type { ResearchRunMetadataForm } from "../research/researchRunMetadata";
import type { StreamTelemetryCsvSample } from "../telemetry/streamTelemetryExport";
import { StreamTelemetryControls } from "./StreamTelemetryControls";
import { StreamTelemetryHistoryChart } from "./StreamTelemetryHistoryChart";
import { StreamTelemetrySummary } from "./StreamTelemetrySummary";

const ResearchRunModal = lazy(() =>
  import("./ResearchRunModal").then(({ ResearchRunModal }) => ({
    default: ResearchRunModal,
  })),
);

type StreamTelemetryPanelProps = {
  gameId: string | undefined;
  gameTitle: string;
  isRecordingCsv: boolean;
  playerMode: "guest" | "host";
  researchRun: {
    baselineForm: ResearchBaselineForm;
    events: ResearchRunEvent[];
    metadataForm: ResearchRunMetadataForm;
    onBaselineFormChange: (form: ResearchBaselineForm) => void;
    onMetadataFormChange: (form: ResearchRunMetadataForm) => void;
    runId: string;
  };
  recordedCsvSamples: StreamTelemetryCsvSample[];
  sessionId: string;
  shareUrl: string;
  status: string;
  streamProfile: StreamProfile;
  telemetry: WebRTCTelemetry;
  onClearTelemetryCsv: () => void;
  onClose: () => void;
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
    onResetTelemetryData,
    onToggleCsvRecording,
    researchRun,
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
    resetCsvState,
    resetExportStates,
  } = useStreamTelemetryExportActions({
    gameId,
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
        isRecordingCsv={isRecordingCsv}
        onClearTelemetryCsv={clearTelemetryCsv}
        onCopyTelemetry={() => {
          void copyTelemetry();
        }}
        onExportTelemetryCsv={() => {
          void exportTelemetryCsv();
        }}
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
        <Suspense
          fallback={
            <div
              aria-live="polite"
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 text-sm font-semibold text-white"
              role="status"
            >
              Loading research tools…
            </div>
          }
        >
          <ResearchRunModal
            events={researchRun.events}
            baselineForm={researchRun.baselineForm}
            form={researchRun.metadataForm}
            gameId={gameId}
            gameTitle={gameTitle}
            history={history}
            onClose={() => setIsResearchModalOpen(false)}
            onBaselineFormChange={researchRun.onBaselineFormChange}
            onFormChange={researchRun.onMetadataFormChange}
            playerMode={props.playerMode}
            recordedCsvSamples={recordedCsvSamples}
            runId={researchRun.runId}
            sessionId={sessionId}
            shareUrl={shareUrl}
            status={status}
            streamProfile={streamProfile}
          />
        </Suspense>
      )}
    </section>
  );
}
