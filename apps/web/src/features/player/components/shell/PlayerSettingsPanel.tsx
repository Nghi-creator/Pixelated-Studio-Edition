import { Pause, Play, RotateCcw, Square } from "lucide-react";
import type {
  StreamProfile,
  StreamProfileId,
} from "../../../../lib/engine/streamProfiles";

const menuButtonClass =
  "inline-flex h-10 min-w-0 items-center justify-center gap-2 rounded-lg border border-synth-border bg-synth-bg px-3 text-sm font-semibold text-white transition-colors hover:bg-synth-elevated disabled:cursor-not-allowed disabled:opacity-45";

export function PlayerSettingsPanel({
  canPauseStream,
  canRestartSession,
  canResetSession,
  canStopSession,
  isPlaybackPaused,
  lobbyParticipantCount,
  onClose,
  onOpenKeyboard,
  onOpenLobby,
  onPauseToggle,
  onReset,
  onStop,
  onStreamProfileChange,
  selectedStreamProfileId,
  showLobbyControls,
  streamProfileLocked,
  streamProfiles,
}: {
  canPauseStream: boolean;
  canRestartSession: boolean;
  canResetSession: boolean;
  canStopSession: boolean;
  isPlaybackPaused: boolean;
  lobbyParticipantCount: number;
  onClose: () => void;
  onOpenKeyboard: () => void;
  onOpenLobby: () => void;
  onPauseToggle: () => void;
  onReset: () => void;
  onStop: () => void;
  onStreamProfileChange: (profileId: StreamProfileId) => void;
  selectedStreamProfileId: StreamProfileId;
  showLobbyControls: boolean;
  streamProfileLocked: boolean;
  streamProfiles: StreamProfile[];
}) {
  const openTool = (callback: () => void) => {
    onClose();
    callback();
  };

  return (
    <div
      id="player-settings-panel"
      className="absolute right-0 mt-3 w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-synth-border bg-synth-surface/95 p-4 text-left shadow-panel backdrop-blur-md"
    >
      <span
        aria-hidden="true"
        className="absolute -top-2 right-3 h-4 w-4 rotate-45 border-l border-t border-synth-border bg-synth-surface"
      />
      <p className="relative text-xs font-bold uppercase tracking-[0.16em] text-synth-secondary">
        Game controls
      </p>
      <div className="relative mt-2 grid grid-cols-3 gap-2">
        <button
          className={menuButtonClass}
          disabled={!canPauseStream}
          onClick={onPauseToggle}
          title="Pauses local playback only; the remote emulator keeps running"
          type="button"
        >
          {isPlaybackPaused ? (
            <Play aria-hidden="true" className="h-4 w-4" />
          ) : (
            <Pause aria-hidden="true" className="h-4 w-4" />
          )}
          {isPlaybackPaused ? "Resume" : "Pause"}
        </button>
        <button
          className={menuButtonClass}
          disabled={!canResetSession}
          onClick={onReset}
          title="Restart the remote game session"
          type="button"
        >
          <RotateCcw aria-hidden="true" className="h-4 w-4" />
          Reset
        </button>
        <button
          className={menuButtonClass}
          disabled={canRestartSession ? false : !canStopSession}
          onClick={canRestartSession ? onReset : onStop}
          title={
            canRestartSession
              ? "Restart the stopped game session"
              : "Stop the remote game session"
          }
          type="button"
        >
          {canRestartSession ? (
            <RotateCcw aria-hidden="true" className="h-4 w-4" />
          ) : (
            <Square aria-hidden="true" className="h-4 w-4" />
          )}
          {canRestartSession ? "Restart" : "Stop"}
        </button>
      </div>
      <div
        className={`relative mx-auto mt-4 grid w-full gap-2 border-t border-synth-border pt-4 ${
          showLobbyControls ? "grid-cols-2" : "grid-cols-1"
        }`}
      >
        {showLobbyControls && (
          <button
            className={menuButtonClass}
            onClick={() => openTool(onOpenLobby)}
            type="button"
          >
            Lobby
            <span className="rounded-full border border-synth-border bg-synth-surface px-2 py-0.5 text-[10px] font-semibold text-gray-300">
              {lobbyParticipantCount}
            </span>
          </button>
        )}
        <button
          className={menuButtonClass}
          onClick={() => openTool(onOpenKeyboard)}
          type="button"
        >
          Keyboard
        </button>
      </div>
      <p className="relative mt-4 text-xs font-bold uppercase tracking-[0.16em] text-synth-secondary">
        Stream quality
      </p>
      <div className="relative mt-2 grid grid-cols-3 gap-2">
        {streamProfiles.map((profile) => {
          const isSelected = profile.id === selectedStreamProfileId;
          return (
            <button
              key={profile.id}
              type="button"
              onClick={() => onStreamProfileChange(profile.id)}
              disabled={streamProfileLocked}
              className={`min-h-14 rounded-lg border px-2 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-synth-secondary disabled:cursor-not-allowed disabled:opacity-60 ${
                isSelected
                  ? "border-synth-action-hover bg-synth-action text-white"
                  : "border-synth-border bg-synth-bg text-gray-400 hover:text-white"
              }`}
              aria-pressed={isSelected}
              title={
                streamProfileLocked
                  ? "The stream profile is fixed for this research run"
                  : undefined
              }
            >
              <span className="block text-xs font-semibold sm:text-sm">
                {profile.label}
              </span>
              <span
                className={`block text-[10px] sm:text-xs ${
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
  );
}
