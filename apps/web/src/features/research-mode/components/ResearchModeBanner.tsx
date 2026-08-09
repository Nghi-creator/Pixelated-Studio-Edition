import { FlaskConical, X } from "lucide-react";
import { useResearchMode } from "../useResearchMode";

export function ResearchModeBanner({
  allowExit = true,
  compact = false,
}: {
  allowExit?: boolean;
  compact?: boolean;
}) {
  const { disableResearchMode, isResearchMode } = useResearchMode();
  if (!isResearchMode) return null;

  return (
    <div
      className={`flex w-full items-center gap-3 rounded-lg border border-synth-action-hover bg-synth-action/20 text-white ${
        compact ? "px-3 py-2" : "px-4 py-3"
      }`}
      role="status"
    >
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-synth-action-hover bg-synth-action">
        <FlaskConical aria-hidden="true" className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-bold">Research Mode active</p>
        {!compact && (
          <p className="text-sm text-gray-300">
            Selecting a game opens run setup instead of normal play.
          </p>
        )}
      </div>
      {allowExit && (
        <button
          aria-label="Exit Research Mode"
          className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-synth-border bg-synth-bg px-3 text-sm font-semibold text-white transition-colors hover:bg-synth-elevated"
          onClick={disableResearchMode}
          type="button"
        >
          <X aria-hidden="true" className="h-4 w-4" />
          <span className="hidden sm:inline">Exit mode</span>
        </button>
      )}
    </div>
  );
}
