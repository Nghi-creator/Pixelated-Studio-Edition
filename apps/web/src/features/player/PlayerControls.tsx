import { SlidersHorizontal } from "lucide-react";
import type {
  StreamProfile,
  StreamProfileId,
} from "../../lib/streamProfiles";

type PlayerControlsProps = {
  authorName: string | null;
  onStreamProfileChange: (profileId: StreamProfileId) => void;
  reactionButtons: React.ReactNode;
  selectedStreamProfileId: StreamProfileId;
  streamProfiles: StreamProfile[];
};

export function PlayerControls({
  authorName,
  onStreamProfileChange,
  reactionButtons,
  selectedStreamProfileId,
  streamProfiles,
}: PlayerControlsProps) {
  return (
    <div className="w-full max-w-5xl mt-6 flex flex-col gap-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
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

      <div className="flex flex-col gap-2 border-t border-synth-border pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-4 text-gray-400 text-sm">
          <SlidersHorizontal className="h-4 w-4 text-synth-primary" />
          <span className="font-medium text-gray-300">Stream Profile</span>
        </div>

        <div className="grid grid-cols-3 gap-2 sm:w-auto">
          {streamProfiles.map((profile) => {
            const isSelected = profile.id === selectedStreamProfileId;
            return (
              <button
                key={profile.id}
                type="button"
                onClick={() => onStreamProfileChange(profile.id)}
                className={`min-h-12 rounded-lg border px-3 text-left transition-colors ${
                  isSelected
                    ? "border-synth-primary bg-synth-primary/15 text-white"
                    : "border-synth-border bg-synth-surface text-gray-400 hover:text-white"
                }`}
              >
                <span className="block text-sm font-semibold">
                  {profile.label}
                </span>
                <span className="block text-xs text-gray-500">
                  {profile.fps}fps · {profile.bitrateKbps}kbps
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
