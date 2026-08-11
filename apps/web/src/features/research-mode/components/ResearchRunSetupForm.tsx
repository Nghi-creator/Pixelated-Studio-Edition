import { Volume2, VolumeX } from "lucide-react";
import { AdminSelect } from "../../../components/ui/AdminSelect";
import { STREAM_PROFILES } from "../../../lib/engine/streamProfiles";
import { ResearchMetadataFields } from "../../player/components/research/ResearchMetadataFields";
import type { ResearchRunMetadataForm } from "../../player/research/researchRunMetadata";
import {
  researchRunConfigForPhase,
  type ResearchRunConfig,
  type ResearchRunPhase,
} from "../researchRunConfig";

const FIELD_CLASS =
  "mt-1 h-10 w-full rounded-lg border border-synth-border bg-synth-bg px-3 text-sm font-medium normal-case text-white outline-none transition placeholder:text-gray-500 focus:border-synth-primary";
const SELECT_BUTTON_CLASS =
  "flex h-10 w-full items-center justify-between gap-4 rounded-lg border border-synth-border bg-synth-bg pl-3 pr-6 text-left text-sm font-semibold normal-case text-white outline-none transition hover:border-synth-primary focus:border-synth-primary";
const SELECT_MENU_CLASS =
  "absolute left-0 top-full z-50 mt-2 w-full overflow-hidden rounded-lg border border-synth-border bg-synth-bg py-1 shadow-card";

const PHASE_OPTIONS: Array<{ label: string; value: ResearchRunPhase }> = [
  { label: "Healthy", value: "healthy" },
  { label: "Degraded", value: "degraded" },
  { label: "Relief", value: "relief" },
  { label: "Custom", value: "custom" },
];

export function ResearchRunSetupForm({
  config,
  errors,
  onChange,
  onSubmit,
}: {
  config: ResearchRunConfig;
  errors: string[];
  onChange: (config: ResearchRunConfig) => void;
  onSubmit: () => void;
}) {
  const setField = <Key extends keyof ResearchRunConfig>(
    key: Key,
    value: ResearchRunConfig[Key],
  ) => onChange({ ...config, [key]: value });
  const metadataForm: ResearchRunMetadataForm = {
    coldStart: config.coldStart,
    networkType: config.networkType,
    notes: config.notes,
    scenario: config.scenario,
  };

  return (
    <form
      className="mt-6 space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      {errors.length > 0 && (
        <div
          aria-live="polite"
          className="danger-panel rounded-lg border px-4 py-3 text-sm"
          role="alert"
        >
          <p className="font-bold">Complete the run configuration:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      )}

      <fieldset className="grid gap-4 rounded-lg border border-synth-border bg-synth-bg/40 p-4 sm:grid-cols-2">
        <legend className="px-2 text-xs font-bold uppercase tracking-[0.16em] text-synth-secondary">
          Run identity
        </legend>
        <label className="text-xs font-semibold uppercase text-white">
          Comparison case ID
          <input
            className={FIELD_CLASS}
            onChange={(event) =>
              setField("comparisonCaseId", event.target.value)
            }
            placeholder="controlled-run-001"
            value={config.comparisonCaseId}
          />
        </label>
        <label className="text-xs font-semibold uppercase text-white">
          Run ID
          <input className={`${FIELD_CLASS} text-gray-400`} readOnly value={config.runId} />
        </label>
        <label className="text-xs font-semibold uppercase text-white">
          Phase
          <AdminSelect
            ariaLabel="Research run phase"
            buttonClassName={SELECT_BUTTON_CLASS}
            className="mt-1"
            menuClassName={SELECT_MENU_CLASS}
            onChange={(value) =>
              onChange(researchRunConfigForPhase(config, value))
            }
            options={PHASE_OPTIONS}
            value={config.phase}
          />
        </label>
        <label className="text-xs font-semibold uppercase text-white">
          Stream profile
          <AdminSelect
            ariaLabel="Research stream profile"
            buttonClassName={SELECT_BUTTON_CLASS}
            className="mt-1"
            menuClassName={SELECT_MENU_CLASS}
            onChange={(value) => setField("streamProfileId", value)}
            options={STREAM_PROFILES.map((profile) => ({
              label: `${profile.label} · ${profile.fps}fps · ${profile.bitrateKbps}kbps`,
              value: profile.id,
            }))}
            value={config.streamProfileId}
          />
        </label>
      </fieldset>

      <fieldset className="grid gap-4 rounded-lg border border-synth-border bg-synth-bg/40 p-4 sm:grid-cols-2">
        <legend className="px-2 text-xs font-bold uppercase tracking-[0.16em] text-synth-secondary">
          Timing and environment
        </legend>
        <label className="text-xs font-semibold uppercase text-white">
          Warm-up seconds
          <input
            className={FIELD_CLASS}
            min="0"
            onChange={(event) =>
              setField("warmupDurationMs", Number(event.target.value) * 1000)
            }
            step="1"
            type="number"
            value={config.warmupDurationMs / 1000}
          />
        </label>
        <label className="text-xs font-semibold uppercase text-white">
          Recording seconds
          <input
            className={FIELD_CLASS}
            min="1"
            onChange={(event) =>
              setField("recordingDurationMs", Number(event.target.value) * 1000)
            }
            step="1"
            type="number"
            value={config.recordingDurationMs / 1000}
          />
        </label>
        <label className="text-xs font-semibold uppercase text-white">
          Anonymized node label
          <input
            className={FIELD_CLASS}
            onChange={(event) => setField("nodeLabel", event.target.value)}
            value={config.nodeLabel}
          />
        </label>
        <label className="text-xs font-semibold uppercase text-white">
          Runtime label
          <input
            className={FIELD_CLASS}
            onChange={(event) => setField("runtimeLabel", event.target.value)}
            value={config.runtimeLabel}
          />
        </label>
        <label className="text-xs font-semibold uppercase text-white sm:col-span-2">
          Intervention label
          <input
            className={FIELD_CLASS}
            onChange={(event) =>
              setField("interventionLabel", event.target.value)
            }
            placeholder="none"
            value={config.interventionLabel}
          />
        </label>
      </fieldset>

      <fieldset className="rounded-lg border border-synth-border bg-synth-bg/40 p-4">
        <legend className="px-2 text-xs font-bold uppercase tracking-[0.16em] text-synth-secondary">
          Scenario metadata
        </legend>
        <ResearchMetadataFields
          form={metadataForm}
          onChange={(form) =>
            onChange({
              ...config,
              coldStart: form.coldStart,
              networkType: form.networkType,
              notes: form.notes,
              scenario: form.scenario,
            })
          }
        />
      </fieldset>

      <fieldset className="rounded-lg border border-synth-border bg-synth-bg/40 p-4">
        <legend className="px-2 text-xs font-bold uppercase tracking-[0.16em] text-synth-secondary">
          Fixed audio state
        </legend>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <button
            aria-pressed={config.audioMuted}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-synth-border bg-synth-bg px-4 text-sm font-semibold text-white transition-colors hover:bg-synth-elevated"
            onClick={() => setField("audioMuted", !config.audioMuted)}
            type="button"
          >
            {config.audioMuted ? (
              <VolumeX aria-hidden="true" className="h-5 w-5" />
            ) : (
              <Volume2 aria-hidden="true" className="h-5 w-5" />
            )}
            {config.audioMuted ? "Muted" : "Audio on"}
          </button>
          <label className="flex flex-1 items-center gap-3 text-sm font-semibold text-white">
            Volume
            <input
              aria-label="Research game volume"
              className="h-1.5 flex-1 cursor-pointer accent-synth-secondary disabled:cursor-not-allowed disabled:opacity-50"
              disabled={config.audioMuted}
              max="1"
              min="0"
              onChange={(event) =>
                setField("audioVolume", Number(event.target.value))
              }
              step="0.05"
              type="range"
              value={config.audioVolume}
            />
            <span className="w-10 text-right text-gray-400">
              {Math.round(config.audioVolume * 100)}%
            </span>
          </label>
        </div>
        <p className="mt-2 text-xs text-gray-400">
          Audio remains available during play but is fixed for the formal run.
        </p>
      </fieldset>
    </form>
  );
}

