import {
  Grid2X2,
  Maximize2,
  Pause,
  Play,
  RotateCcw,
  Settings,
  Square,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { PixelIcon } from "../../../components/ui/PixelIcon";
import type {
  StreamProfile,
  StreamProfileId,
} from "../../../lib/engine/streamProfiles";

type PlayerControlsProps = {
  canPauseStream: boolean;
  canResetSession: boolean;
  canStopSession: boolean;
  gameTitle: string;
  isPlaybackPaused: boolean;
  isMuted: boolean;
  onFullscreen: () => void;
  onMuteToggle: () => void;
  onPauseToggle: () => void;
  onPixelPerfectChange: (enabled: boolean) => void;
  onReset: () => void;
  onStop: () => void;
  onStreamProfileChange: (profileId: StreamProfileId) => void;
  onToggleTelemetry: () => void;
  onVolumeChange: (volume: number) => void;
  pixelPerfect: boolean;
  selectedStreamProfileId: StreamProfileId;
  showStreamTelemetry: boolean;
  streamProfiles: StreamProfile[];
  volume: number;
};

export function PlayerControls({
  canPauseStream,
  canResetSession,
  canStopSession,
  gameTitle,
  isPlaybackPaused,
  isMuted,
  onFullscreen,
  onMuteToggle,
  onPauseToggle,
  onPixelPerfectChange,
  onReset,
  onStop,
  onStreamProfileChange,
  onToggleTelemetry,
  onVolumeChange,
  pixelPerfect,
  selectedStreamProfileId,
  showStreamTelemetry,
  streamProfiles,
  volume,
}: PlayerControlsProps) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const controlsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isSettingsOpen) return;

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (
        controlsRef.current &&
        !controlsRef.current.contains(event.target as Node)
      ) {
        setIsSettingsOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsSettingsOpen(false);
    };

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isSettingsOpen]);

  const controlButtonClass =
    "inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[#5D263A] bg-[#351B27] text-white transition-colors hover:bg-[#2B1720] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-synth-secondary";
  const menuButtonClass =
    "inline-flex h-10 min-w-0 items-center justify-center gap-2 rounded-lg border border-synth-border bg-synth-bg px-3 text-sm font-semibold text-white transition-colors hover:bg-synth-elevated disabled:cursor-not-allowed disabled:opacity-45";

  return (
    <div
      ref={controlsRef}
      className="relative z-20 flex h-14 w-full items-center gap-2 rounded-t-lg border border-b-0 border-synth-border bg-synth-surface px-3"
    >
      <h1 className="min-w-0 flex-1 truncate text-lg font-extrabold text-white sm:text-xl">
        {gameTitle || "Loading Game..."}
      </h1>

      <button
        type="button"
        onClick={onToggleTelemetry}
        className={controlButtonClass}
        aria-label="Toggle stream telemetry"
        aria-pressed={showStreamTelemetry}
        title="Toggle stream telemetry"
      >
        <PixelIcon aria-hidden="true" className="h-5 w-5" name="logs" />
      </button>

      <button
        type="button"
        onClick={onFullscreen}
        className={controlButtonClass}
        aria-label="Enter fullscreen"
        title="Enter fullscreen"
      >
        <Maximize2 aria-hidden="true" className="h-5 w-5" />
      </button>

      <button
        type="button"
        onClick={() => onPixelPerfectChange(!pixelPerfect)}
        className={controlButtonClass}
        aria-label={pixelPerfect ? "Disable pixel rendering" : "Enable pixel rendering"}
        aria-pressed={pixelPerfect}
        title={pixelPerfect ? "Disable pixel rendering" : "Enable pixel rendering"}
      >
        <Grid2X2 aria-hidden="true" className="h-5 w-5" />
      </button>

      <div className="hidden h-10 items-center rounded-lg border border-[#5D263A] bg-[#351B27] sm:flex">
        <button
          type="button"
          onClick={onMuteToggle}
          className="inline-flex h-full w-10 shrink-0 items-center justify-center rounded-l-lg text-white transition-colors hover:bg-[#2B1720] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-synth-secondary"
          aria-label={isMuted ? "Unmute game audio" : "Mute game audio"}
          title={isMuted ? "Unmute game audio" : "Mute game audio"}
        >
          {isMuted ? (
            <VolumeX aria-hidden="true" className="h-5 w-5" />
          ) : (
            <Volume2 aria-hidden="true" className="h-5 w-5" />
          )}
        </button>
        <input
          aria-label="Game volume"
          className="mx-3 h-1.5 w-20 cursor-pointer accent-synth-secondary lg:w-28"
          max="1"
          min="0"
          onChange={(event) => onVolumeChange(Number(event.target.value))}
          step="0.05"
          type="range"
          value={volume}
        />
      </div>

      <div className="relative">
        <button
          type="button"
          onClick={() => setIsSettingsOpen((isOpen) => !isOpen)}
          className={controlButtonClass}
          aria-controls="player-settings-panel"
          aria-expanded={isSettingsOpen}
          aria-label="Game settings"
          title="Game settings"
        >
          <Settings aria-hidden="true" className="h-5 w-5" />
        </button>

        {isSettingsOpen && (
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
                disabled={!canStopSession}
                onClick={onStop}
                title="Stop the remote game session"
                type="button"
              >
                <Square aria-hidden="true" className="h-4 w-4" />
                Stop
              </button>
            </div>
            <p className="relative mt-4 border-t border-synth-border pt-4 text-xs font-bold uppercase tracking-[0.16em] text-synth-secondary">
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
                    className={`min-h-14 rounded-lg border px-2 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-synth-secondary ${
                      isSelected
                        ? "border-synth-action-hover bg-synth-action text-white"
                        : "border-synth-border bg-synth-bg text-gray-400 hover:text-white"
                    }`}
                    aria-pressed={isSelected}
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
        )}
      </div>
    </div>
  );
}

export function PlayerInstructions({
  layoutClassName = "max-w-5xl",
  lobby,
}: {
  layoutClassName?: string;
  lobby?: ReactNode;
}) {
  return (
    <div
      className={`mt-6 w-full rounded-lg border border-synth-border bg-synth-surface p-4 ${layoutClassName}`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-synth-secondary">
          <span className="inline-flex items-center gap-2">
            <span className="text-white">Move</span>
            <kbd className="rounded border border-synth-border bg-synth-bg px-2 py-1 font-mono text-gray-200">
              ARROWS
            </kbd>
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="text-white">Action</span>
            <kbd className="rounded border border-synth-border bg-synth-bg px-2 py-1 font-mono text-gray-200">
              Z
            </kbd>
            <kbd className="rounded border border-synth-border bg-synth-bg px-2 py-1 font-mono text-gray-200">
              X
            </kbd>
          </span>
        </div>
        {lobby}
      </div>
    </div>
  );
}
