type PlayerControlsProps = {
  authorName: string | null;
  reactionButtons: React.ReactNode;
};

export function PlayerControls({
  authorName,
  reactionButtons,
}: PlayerControlsProps) {
  return (
    <div className="w-full max-w-5xl mt-6 flex flex-col sm:flex-row justify-between items-start gap-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-4 text-gray-400 text-sm">
          <p>
            Move:{" "}
            <kbd className="bg-synth-elevated border border-synth-border px-2 py-1 rounded text-gray-200 ml-1 font-mono">
              ARROWS
            </kbd>
          </p>
          <p className="border-l border-synth-border pl-4">
            Action:{" "}
            <kbd className="bg-synth-elevated border border-synth-border px-2 py-1 rounded text-gray-200 ml-1 font-mono">
              Z
            </kbd>{" "}
            /{" "}
            <kbd className="bg-synth-elevated border border-synth-border px-2 py-1 rounded text-gray-200 ml-1 font-mono">
              X
            </kbd>
          </p>
        </div>

        {authorName && (
          <p className="text-synth-primary text-sm font-medium flex items-center gap-1.5">
            Developed by: {authorName}
          </p>
        )}
      </div>

      {reactionButtons}
    </div>
  );
}
