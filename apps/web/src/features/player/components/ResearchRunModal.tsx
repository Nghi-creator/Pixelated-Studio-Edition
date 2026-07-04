import { Download, X } from "lucide-react";
import type { StreamProfile } from "../../../lib/engine/streamProfiles";
import {
  createResearchRunEventsFilename,
  findFirstEventElapsedMs,
  researchRunEventsToCsv,
  type ResearchRunEvent,
} from "../researchRunEvents";
import {
  createResearchRunMetadata,
  createResearchRunMetadataFilename,
  RESEARCH_RUN_SCHEMA_VERSION,
  researchRunMetadataToJson,
  type ResearchRunMetadataForm,
  type ResearchRunScenario,
} from "../researchRunMetadata";

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

function downloadText(filename: string, text: string, type: string) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function ResearchRunModal({
  events,
  form,
  gameId,
  gameTitle,
  onClose,
  onFormChange,
  playerMode,
  runId,
  sessionId,
  shareUrl,
  status,
  streamProfile,
}: {
  events: ResearchRunEvent[];
  form: ResearchRunMetadataForm;
  gameId: string | undefined;
  gameTitle: string;
  onClose: () => void;
  onFormChange: (form: ResearchRunMetadataForm) => void;
  playerMode: "guest" | "host";
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

  const exportMetadata = () => {
    const capturedAt = new Date();
    const metadata = createResearchRunMetadata({
      capturedAt,
      form,
      gameId,
      gameTitle,
      playerMode,
      runId,
      sessionId,
      shareUrl,
      status,
      streamProfile,
      userAgent: navigator.userAgent,
    });

    downloadText(
      createResearchRunMetadataFilename({ gameId, recordedAt: capturedAt, runId }),
      researchRunMetadataToJson(metadata),
      "application/json;charset=utf-8",
    );
  };

  const exportEvents = () => {
    const capturedAt = new Date();
    downloadText(
      createResearchRunEventsFilename({ gameId, recordedAt: capturedAt, runId }),
      researchRunEventsToCsv(events),
      "text/csv;charset=utf-8",
    );
  };

  const firstFrameElapsedMs = findFirstEventElapsedMs(
    events,
    "first_non_black_frame",
  );
  const pythonReadyElapsedMs = findFirstEventElapsedMs(events, "python_ready");
  const startGameElapsedMs = findFirstEventElapsedMs(events, "start_game_emitted");

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

        <div className="mt-4 grid grid-cols-2 gap-2 rounded-md border border-synth-border bg-synth-bg/80 p-3 text-xs">
          <div>
            <div className="font-semibold uppercase text-gray-500">Schema</div>
            <div className="mt-1 font-bold text-white">
              {RESEARCH_RUN_SCHEMA_VERSION}
            </div>
          </div>
          <div>
            <div className="font-semibold uppercase text-gray-500">Mode</div>
            <div className="mt-1 font-bold capitalize text-white">
              {playerMode}
            </div>
          </div>
          <div>
            <div className="font-semibold uppercase text-gray-500">Session</div>
            <div className="mt-1 truncate font-bold text-white">
              {sessionId}
            </div>
          </div>
          <div>
            <div className="font-semibold uppercase text-gray-500">Profile</div>
            <div className="mt-1 truncate font-bold text-white">
              {streamProfile.id}
            </div>
          </div>
          <div>
            <div className="font-semibold uppercase text-gray-500">Events</div>
            <div className="mt-1 font-bold text-white">{events.length}</div>
          </div>
          <div>
            <div className="font-semibold uppercase text-gray-500">
              First frame
            </div>
            <div className="mt-1 font-bold text-white">
              {firstFrameElapsedMs === null ? "--" : `${firstFrameElapsedMs} ms`}
            </div>
          </div>
          <div>
            <div className="font-semibold uppercase text-gray-500">
              Start game
            </div>
            <div className="mt-1 font-bold text-white">
              {startGameElapsedMs === null ? "--" : `${startGameElapsedMs} ms`}
            </div>
          </div>
          <div>
            <div className="font-semibold uppercase text-gray-500">
              Python ready
            </div>
            <div className="mt-1 font-bold text-white">
              {pythonReadyElapsedMs === null ? "--" : `${pythonReadyElapsedMs} ms`}
            </div>
          </div>
        </div>

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
            disabled={events.length === 0}
            onClick={exportEvents}
            type="button"
          >
            <Download className="h-4 w-4" />
            Events CSV
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
