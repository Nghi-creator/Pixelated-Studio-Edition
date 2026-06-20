import type {
  StreamProfile,
  StreamProfileId,
} from "../../lib/engine/streamProfiles";

type PlayerControlsProps = {
  onStreamProfileChange: (profileId: StreamProfileId) => void;
  selectedStreamProfileId: StreamProfileId;
  streamProfiles: StreamProfile[];
};

export function PlayerControls({
  onStreamProfileChange,
  selectedStreamProfileId,
  streamProfiles,
}: PlayerControlsProps) {
  return (
    <div className="mt-6 w-full max-w-5xl rounded-lg border border-synth-border bg-synth-surface p-4">
      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(360px,auto)] md:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-synth-secondary">
            <span className="inline-flex items-center gap-2">
              <span>Move</span>
              <kbd className="rounded border border-synth-border bg-synth-bg px-2 py-1 font-mono text-gray-200">
                ARROWS
              </kbd>
            </span>
            <span className="inline-flex items-center gap-2">
              <span>Action</span>
              <kbd className="rounded border border-synth-border bg-synth-bg px-2 py-1 font-mono text-gray-200">
                Z
              </kbd>
              <kbd className="rounded border border-synth-border bg-synth-bg px-2 py-1 font-mono text-gray-200">
                X
              </kbd>
            </span>
          </div>

        </div>

        <div className="min-w-0 md:justify-self-end">
          <div className="grid grid-cols-3 gap-2">
            {streamProfiles.map((profile) => {
              const isSelected = profile.id === selectedStreamProfileId;
              return (
                <button
                  key={profile.id}
                  type="button"
                  onClick={() => onStreamProfileChange(profile.id)}
                  className={`min-h-12 rounded-lg border px-3 text-left transition-colors ${
                    isSelected
                      ? "border-synth-action-hover bg-synth-action text-white"
                      : "border-synth-border bg-synth-bg text-gray-400 hover:text-white"
                  }`}
                >
                  <span className="block text-sm font-semibold">
                    {profile.label}
                  </span>
                  <span
                    className={`block text-xs ${
                      isSelected ? "text-white/70" : "text-gray-500"
                    }`}
                  >
                    {profile.fps}fps · {profile.bitrateKbps}kbps
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
