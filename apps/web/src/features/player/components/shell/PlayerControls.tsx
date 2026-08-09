import {
  Blend,
  Maximize2,
  ScanLine,
  Settings,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { PixelIcon } from "../../../../components/ui/PixelIcon";
import type {
  StreamProfile,
  StreamProfileId,
} from "../../../../lib/engine/streamProfiles";
import { PlayerSettingsPanel } from "./PlayerSettingsPanel";

type PlayerControlsProps = {
  canPauseStream: boolean;
  canRestartSession: boolean;
  canResetSession: boolean;
  canStopSession: boolean;
  gameTitle: string;
  isPlaybackPaused: boolean;
  isMuted: boolean;
  lobbyParticipantCount: number;
  onFullscreen: () => void;
  onOpenKeyboard: () => void;
  onOpenLobby: () => void;
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
  canRestartSession,
  canResetSession,
  canStopSession,
  gameTitle,
  isPlaybackPaused,
  isMuted,
  lobbyParticipantCount,
  onFullscreen,
  onOpenKeyboard,
  onOpenLobby,
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
  const lastAudibleVolumeRef = useRef(volume > 0 ? volume : 1);

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

  useEffect(() => {
    if (volume > 0) lastAudibleVolumeRef.current = volume;
  }, [volume]);

  const handleMuteToggle = () => {
    if (isMuted && volume === 0) {
      onVolumeChange(lastAudibleVolumeRef.current);
    } else if (!isMuted) {
      onVolumeChange(0);
    }
    onMuteToggle();
  };
  const handleVolumeChange = (nextVolume: number) => {
    onVolumeChange(nextVolume);
    if ((nextVolume === 0 && !isMuted) || (nextVolume > 0 && isMuted)) {
      onMuteToggle();
    }
  };

  const controlButtonClass =
    "inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[#5D263A] bg-[#351B27] text-white transition-colors hover:bg-[#2B1720] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-synth-secondary";
  const pixelButtonClass = `inline-flex h-10 w-10 items-center justify-center rounded-lg border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-synth-secondary ${
    pixelPerfect
      ? "border-synth-action-hover bg-synth-action text-white shadow-[0_0_0_2px_rgba(255,153,193,0.35)] hover:brightness-110"
      : "border-[#5D263A] bg-[#351B27] text-gray-400 hover:bg-[#2B1720] hover:text-white"
  }`;
  return (
    <div
      ref={controlsRef}
      className="relative z-20 flex h-14 w-full items-center gap-2 rounded-t-lg border border-b-0 border-synth-border bg-synth-surface px-3"
    >
      <h1 className="min-w-0 flex-1 truncate text-lg font-extrabold text-white sm:text-xl">
        {gameTitle || "Loading Game..."}
      </h1>

      <div className="hidden h-10 items-center rounded-lg border border-[#5D263A] bg-[#351B27] sm:flex">
        <button
          type="button"
          onClick={handleMuteToggle}
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
          onChange={(event) =>
            handleVolumeChange(Number(event.target.value))
          }
          step="0.05"
          type="range"
          value={volume}
        />
      </div>

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
        className={pixelButtonClass}
        aria-label={pixelPerfect ? "Disable pixel rendering" : "Enable pixel rendering"}
        aria-pressed={pixelPerfect}
        title={pixelPerfect ? "Pixel rendering on" : "Pixel rendering off"}
      >
        {pixelPerfect ? (
          <ScanLine aria-hidden="true" className="h-5 w-5" />
        ) : (
          <Blend aria-hidden="true" className="h-5 w-5" />
        )}
      </button>

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
          <PlayerSettingsPanel
            canPauseStream={canPauseStream}
            canRestartSession={canRestartSession}
            canResetSession={canResetSession}
            canStopSession={canStopSession}
            isPlaybackPaused={isPlaybackPaused}
            lobbyParticipantCount={lobbyParticipantCount}
            onClose={() => setIsSettingsOpen(false)}
            onOpenKeyboard={onOpenKeyboard}
            onOpenLobby={onOpenLobby}
            onPauseToggle={onPauseToggle}
            onReset={onReset}
            onStop={onStop}
            onStreamProfileChange={onStreamProfileChange}
            selectedStreamProfileId={selectedStreamProfileId}
            streamProfiles={streamProfiles}
          />
        )}
      </div>
    </div>
  );
}
