import { FlaskConical, Square, X } from "lucide-react";
import type { ResearchRunConfig } from "../researchRunConfig";
import type { ResearchRunControllerState } from "../researchRunController";

const STAGE_LABELS: Record<ResearchRunControllerState["stage"], string> = {
  cancelled: "Cancelled",
  completed: "Completed",
  connecting: "Waiting for connected stream",
  invalid: "Invalid run",
  preparing: "Preparing capture",
  ready: "Stream ready",
  recording: "Recording",
  warming_up: "Warm-up",
};

function formatRemaining(remainingMs: number | null) {
  if (remainingMs === null) return null;
  return `${Math.ceil(remainingMs / 1000)}s`;
}

export function ResearchRunHud({
  config,
  computeSampleCount,
  onCancel,
  onStop,
  remainingMs,
  sampleCount,
  state,
}: {
  config: ResearchRunConfig;
  computeSampleCount?: number;
  onCancel: () => void;
  onStop: () => void;
  remainingMs: number | null;
  sampleCount: number;
  state: ResearchRunControllerState;
}) {
  const remaining = formatRemaining(remainingMs);
  const isActive =
    state.stage !== "completed" &&
    state.stage !== "invalid" &&
    state.stage !== "cancelled";

  return (
    <section
      aria-live="polite"
      className="mt-3 flex w-full flex-wrap items-center gap-3 rounded-lg border border-synth-border bg-synth-surface px-3 py-2 shadow-panel"
      data-ignore-game-input
    >
      <span
        className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border text-white ${
          state.stage === "recording"
            ? "animate-pulse border-synth-action-hover bg-synth-action"
            : "border-synth-border bg-synth-bg"
        }`}
      >
        <FlaskConical aria-hidden="true" className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className="font-bold text-white">{STAGE_LABELS[state.stage]}</p>
          <span className="rounded-full border border-synth-border bg-synth-bg px-2 py-0.5 text-[11px] font-bold uppercase text-synth-secondary">
            {config.phase}
          </span>
          <span className="text-xs text-gray-400">
            {config.streamProfileId} · {sampleCount} browser · {computeSampleCount || 0} compute samples
          </span>
        </div>
        <p className="mt-0.5 truncate text-xs text-gray-400">
          {config.comparisonCaseId} · {config.runId}
        </p>
      </div>
      {remaining && (
        <span className="min-w-16 text-right text-2xl font-extrabold tabular-nums text-white">
          {remaining}
        </span>
      )}
      {state.stage === "recording" && (
        <button
          className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-synth-border bg-synth-bg px-3 text-sm font-semibold text-white transition-colors hover:bg-synth-elevated"
          onClick={onStop}
          type="button"
        >
          <Square aria-hidden="true" className="h-4 w-4" />
          Stop
        </button>
      )}
      {isActive && (
        <button
          aria-label="Cancel research run"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-synth-border bg-synth-bg text-gray-300 transition-colors hover:bg-synth-elevated hover:text-white"
          onClick={onCancel}
          title="Cancel research run"
          type="button"
        >
          <X aria-hidden="true" className="h-4 w-4" />
        </button>
      )}
    </section>
  );
}
