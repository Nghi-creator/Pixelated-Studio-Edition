import { useResearchMode } from "./useResearchMode";

export function ResearchModeToggle() {
  const { isResearchMode, toggleResearchMode } = useResearchMode();

  return (
    <button
      aria-checked={isResearchMode}
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-synth-secondary ${
        isResearchMode
          ? "border-synth-action-hover bg-synth-action text-white shadow-[0_0_0_2px_rgba(255,153,193,0.25)] hover:brightness-110"
          : "border-synth-secondary/40 bg-synth-bg text-white hover:border-synth-secondary hover:bg-synth-elevated"
      }`}
      onClick={toggleResearchMode}
      role="switch"
      type="button"
    >
      {isResearchMode ? "Research mode" : "Normal mode"}
    </button>
  );
}
