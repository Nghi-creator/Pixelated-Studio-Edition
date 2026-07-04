import { Download, X } from "lucide-react";
import type { StreamProfile } from "../../../lib/engine/streamProfiles";
import { useResearchRunExports } from "../hooks/useResearchRunExports";
import type { ResearchBaselineForm } from "../researchBaseline";
import type { ResearchRunEvent } from "../researchRunEvents";
import {
  type ResearchRunMetadataForm,
  type ResearchRunScenario,
} from "../researchRunMetadata";
import type { StreamTelemetryCsvSample } from "../streamTelemetryExport";
import { ResearchBaselineFields } from "./ResearchBaselineFields";
import { ResearchRunPreview } from "./ResearchRunPreview";

const SCENARIO_OPTIONS: Array<{
  label: string;
  value: ResearchRunScenario;
}> = [
  { label: "Localhost", value: "localhost" },
  { label: "LAN", value: "lan" },
  { label: "Browser baseline", value: "browser_only_baseline" },
  { label: "Custom", value: "custom" },
];

const NETWORK_OPTIONS = ["", "Ethernet", "Wi-Fi", "Mobile hotspot", "Custom"];

export function ResearchRunModal({
  baselineForm,
  events,
  form,
  gameId,
  gameTitle,
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
  const setField = <Key extends keyof ResearchRunMetadataForm>(
    key: Key,
    value: ResearchRunMetadataForm[Key],
  ) => {
    onFormChange({ ...form, [key]: value });
  };
  const {
    canExportBundle,
    canExportEvents,
    canExportSummary,
    exportBaseline,
    exportBundle,
    exportEvents,
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
    playerMode,
    recordedCsvSamples,
    runId,
    sessionId,
    shareUrl,
    status,
    streamProfile,
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6"
      data-ignore-game-input
      role="presentation"
    >
      <section
        aria-labelledby="research-run-title"
        aria-modal="true"
        className="max-h-full w-full max-w-lg overflow-y-auto rounded-lg border border-synth-border bg-synth-surface p-4 shadow-card"
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
            <p className="mt-1 max-w-full truncate text-xs font-medium text-gray-500">
              {runId}
            </p>
          </div>
          <button
            aria-label="Close research run"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-synth-border bg-synth-bg text-gray-400 transition hover:bg-synth-elevated hover:text-white"
            onClick={onClose}
            title="Close research run"
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-semibold uppercase text-gray-500">
            Scenario
            <select
              className="mt-1 h-9 w-full rounded-md border border-synth-border bg-synth-bg px-2 text-sm font-semibold normal-case text-white outline-none transition focus:border-synth-primary"
              onChange={(event) =>
                setField("scenario", event.target.value as ResearchRunScenario)
              }
              value={form.scenario}
            >
              {SCENARIO_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs font-semibold uppercase text-gray-500">
            Network
            <select
              className="mt-1 h-9 w-full rounded-md border border-synth-border bg-synth-bg px-2 text-sm font-semibold normal-case text-white outline-none transition focus:border-synth-primary"
              onChange={(event) => setField("networkType", event.target.value)}
              value={form.networkType}
            >
              {NETWORK_OPTIONS.map((networkType) => (
                <option key={networkType || "blank"} value={networkType}>
                  {networkType || "Unspecified"}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2 rounded-md border border-synth-border bg-synth-bg px-3 py-2 text-sm font-semibold text-gray-200 sm:col-span-2">
            <input
              checked={form.coldStart}
              className="h-4 w-4 accent-synth-primary"
              onChange={(event) => setField("coldStart", event.target.checked)}
              type="checkbox"
            />
            Cold start
          </label>

          <label className="block text-xs font-semibold uppercase text-gray-500 sm:col-span-2">
            Notes
            <textarea
              className="mt-1 min-h-24 w-full resize-y rounded-md border border-synth-border bg-synth-bg px-3 py-2 text-sm font-medium normal-case text-white outline-none transition placeholder:text-gray-600 focus:border-synth-primary"
              onChange={(event) => setField("notes", event.target.value)}
              placeholder="Device, room, network, or test condition notes"
              value={form.notes}
            />
          </label>
        </div>

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

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button
            className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-synth-border bg-synth-bg px-3 text-sm font-semibold text-gray-300 transition hover:bg-synth-elevated hover:text-white"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
          <button
            className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-synth-border bg-synth-bg px-3 text-sm font-semibold text-gray-300 transition hover:bg-synth-elevated hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!canExportEvents}
            onClick={exportEvents}
            type="button"
          >
            <Download className="h-4 w-4" />
            Events CSV
          </button>
          <button
            className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-synth-border bg-synth-bg px-3 text-sm font-semibold text-gray-300 transition hover:bg-synth-elevated hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!canExportSummary}
            onClick={exportSummary}
            type="button"
          >
            <Download className="h-4 w-4" />
            Summary JSON
          </button>
          {isBrowserBaseline && (
            <button
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-synth-border bg-synth-bg px-3 text-sm font-semibold text-gray-300 transition hover:bg-synth-elevated hover:text-white"
              onClick={exportBaseline}
              type="button"
            >
              <Download className="h-4 w-4" />
              Baseline JSON
            </button>
          )}
          <button
            className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-synth-border bg-synth-bg px-3 text-sm font-semibold text-gray-300 transition hover:bg-synth-elevated hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!canExportBundle}
            onClick={exportBundle}
            type="button"
          >
            <Download className="h-4 w-4" />
            Bundle
          </button>
          <button
            className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-synth-primary/70 bg-synth-primary px-3 text-sm font-bold text-white transition hover:border-synth-primary hover:bg-synth-primary/80"
            onClick={exportMetadata}
            type="button"
          >
            <Download className="h-4 w-4" />
            Metadata JSON
          </button>
        </div>
      </section>
    </div>
  );
}
