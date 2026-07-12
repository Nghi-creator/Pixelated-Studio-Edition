import { useEffect, useRef } from "react";
import { Download, X } from "lucide-react";
import type { StreamProfile } from "../../../lib/engine/streamProfiles";
import { useResearchRunExports } from "../hooks/useResearchRunExports";
import type { ResearchBaselineForm } from "../research/researchBaseline";
import type { ResearchRunEvent } from "../research/researchRunEvents";
import type { ResearchRunMetadataForm } from "../research/researchRunMetadata";
import type { StreamTelemetryCsvSample } from "../telemetry/streamTelemetryExport";
import type { StreamTelemetryHistorySample } from "../hooks/useStreamTelemetryHistory";
import { ResearchBaselineFields } from "./ResearchBaselineFields";
import { ResearchMetadataFields } from "./ResearchMetadataFields";
import { ResearchRunPreview } from "./ResearchRunPreview";

const EXPORT_BUTTON_CLASS =
  "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md border border-synth-border bg-synth-bg px-2 text-xs font-semibold text-white transition hover:bg-synth-elevated disabled:cursor-not-allowed disabled:opacity-50";
const EXPORT_PRIMARY_BUTTON_CLASS =
  "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md border border-synth-primary/70 bg-synth-primary px-2 text-xs font-bold text-white transition hover:border-synth-primary hover:bg-synth-primary/80";

export function ResearchRunModal({
  baselineForm,
  events,
  form,
  gameId,
  gameTitle,
  history,
  onBaselineFormChange,
  onClose,
  onFormChange,
  playerMode,
  recordedCsvSamples,
  runId,
  sessionId,
  shareUrl,
  status,
  streamProfile,
}: {
  baselineForm: ResearchBaselineForm;
  events: ResearchRunEvent[];
  form: ResearchRunMetadataForm;
  gameId: string | undefined;
  gameTitle: string;
  history: StreamTelemetryHistorySample[];
  onBaselineFormChange: (form: ResearchBaselineForm) => void;
  onClose: () => void;
  onFormChange: (form: ResearchRunMetadataForm) => void;
  playerMode: "guest" | "host";
  recordedCsvSamples: StreamTelemetryCsvSample[];
  runId: string;
  sessionId: string;
  shareUrl: string;
  status: string;
  streamProfile: StreamProfile;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const {
    canExportBundle,
    canExportEvents,
    canExportGraph,
    canExportSummary,
    exportBaseline,
    exportBundle,
    exportEvents,
    exportGraph,
    exportMetadata,
    exportSummary,
    firstFrameElapsedMs,
    isBrowserBaseline,
    pythonReadyElapsedMs,
    startGameElapsedMs,
    summary,
  } = useResearchRunExports({
    baselineForm,
    events,
    form,
    gameId,
    gameTitle,
    history,
    playerMode,
    recordedCsvSamples,
    runId,
    sessionId,
    shareUrl,
    status,
    streamProfile,
  });

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };

    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6"
      data-ignore-game-input
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      role="presentation"
    >
      <section
        aria-describedby="research-run-description"
        aria-labelledby="research-run-title"
        aria-modal="true"
        className="max-h-full w-full max-w-[37rem] overflow-y-auto rounded-lg border border-synth-border bg-synth-surface p-5 shadow-card"
        role="dialog"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2
              className="text-base font-bold text-white"
              id="research-run-title"
            >
              Research Run
            </h2>
            <p
              className="mt-1 max-w-full truncate text-xs font-medium text-white"
              id="research-run-description"
            >
              {runId}
            </p>
          </div>
          <button
            ref={closeButtonRef}
            aria-label="Close research run"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-synth-border bg-synth-bg text-white transition hover:bg-synth-elevated"
            onClick={onClose}
            title="Close research run"
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <ResearchMetadataFields form={form} onChange={onFormChange} />

        {isBrowserBaseline && (
          <ResearchBaselineFields
            form={baselineForm}
            onChange={onBaselineFormChange}
          />
        )}

        <ResearchRunPreview
          eventCount={events.length}
          firstFrameElapsedMs={firstFrameElapsedMs}
          playerMode={playerMode}
          pythonReadyElapsedMs={pythonReadyElapsedMs}
          recordedSampleCount={recordedCsvSamples.length}
          sessionId={sessionId}
          startGameElapsedMs={startGameElapsedMs}
          streamProfileId={streamProfile.id}
          summary={summary}
        />

        <div className="mt-4 flex flex-nowrap justify-end gap-1.5 overflow-x-auto pb-1">
          <button
            className={EXPORT_BUTTON_CLASS}
            disabled={!canExportGraph}
            onClick={exportGraph}
            type="button"
          >
            <Download className="h-3.5 w-3.5" />
            PNG
          </button>
          <button
            className={EXPORT_BUTTON_CLASS}
            disabled={!canExportEvents}
            onClick={exportEvents}
            type="button"
          >
            <Download className="h-3.5 w-3.5" />
            Events CSV
          </button>
          <button
            className={EXPORT_BUTTON_CLASS}
            disabled={!canExportSummary}
            onClick={exportSummary}
            type="button"
          >
            <Download className="h-3.5 w-3.5" />
            Summary JSON
          </button>
          {isBrowserBaseline && (
            <button
              className={EXPORT_BUTTON_CLASS}
              onClick={exportBaseline}
              type="button"
            >
              <Download className="h-3.5 w-3.5" />
              Baseline JSON
            </button>
          )}
          <button
            className={EXPORT_BUTTON_CLASS}
            disabled={!canExportBundle}
            onClick={exportBundle}
            type="button"
          >
            <Download className="h-3.5 w-3.5" />
            Bundle
          </button>
          <button
            className={EXPORT_PRIMARY_BUTTON_CLASS}
            onClick={exportMetadata}
            type="button"
          >
            <Download className="h-3.5 w-3.5" />
            Metadata JSON
          </button>
        </div>
      </section>
    </div>
  );
}
