import { useRef, useState } from "react";
import { PlayerControls } from "../../../src/features/player/components/shell/PlayerControls";
import { PlayerHeader } from "../../../src/features/player/components/shell/PlayerHeader";
import { StreamStage } from "../../../src/features/player/components/stream/StreamStage";
import { StreamTelemetryPanel } from "../../../src/features/player/components/telemetry/StreamTelemetryPanel";
import {
  STREAM_PROFILES,
  type StreamProfileId,
} from "../../../src/lib/engine/streamProfiles";
import {
  INITIAL_WEBRTC_TELEMETRY,
  type WebRTCTelemetry,
} from "../../../src/lib/webrtc/telemetry/webrtcTelemetry";

export function StreamStageHarness({
  onOpenKeyboard,
  onOpenLobby,
  onRecord,
}: {
  onOpenKeyboard: () => void;
  onOpenLobby: () => void;
  onRecord: (event: string) => void;
}) {
  const [isMuted, setIsMuted] = useState(false);
  const [showTelemetry, setShowTelemetry] = useState(true);
  const [streamProfileId, setStreamProfileId] =
    useState<StreamProfileId>("balanced");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const telemetry: WebRTCTelemetry = {
    ...INITIAL_WEBRTC_TELEMETRY,
    bitrateKbps: 1200,
    connectionState: "connected",
    fps: 60,
    iceConnectionState: "connected",
    jitterMs: 3.5,
    lastEngineError: "Engine could not open the selected game file.",
    lastUpdatedAt: 1_781_500_000_000,
    packetsLost: 0,
  };

  return (
    <section aria-label="Stream stage harness" className="max-w-2xl">
      <PlayerHeader
        backRoute="/home"
        backText="Back to Cloud Library"
        gameTitle="Harness Game"
        status="error"
      />
      <StreamStage
        controls={
          <PlayerControls
            canPauseStream={false}
            canRestartSession={false}
            canResetSession
            canStopSession={false}
            gameTitle="Harness Game"
            isMuted={isMuted}
            isPlaybackPaused={false}
            lobbyParticipantCount={2}
            onFullscreen={() => onRecord("stream-fullscreen")}
            onMuteToggle={() => setIsMuted((muted) => !muted)}
            onOpenKeyboard={onOpenKeyboard}
            onOpenLobby={onOpenLobby}
            onPauseToggle={() => onRecord("stream-pause")}
            onPixelPerfectChange={() => onRecord("stream-pixel")}
            onReset={() => onRecord("stream-reset")}
            onStop={() => onRecord("stream-stop")}
            onStreamProfileChange={setStreamProfileId}
            onToggleTelemetry={() => {
              onRecord(
                showTelemetry ? "telemetry-toggle-off" : "telemetry-toggle-on",
              );
              setShowTelemetry((visible) => !visible);
            }}
            onVolumeChange={() => onRecord("stream-volume")}
            pixelPerfect
            selectedStreamProfileId={streamProfileId}
            showStreamTelemetry={showTelemetry}
            showTelemetryControl
            streamProfiles={STREAM_PROFILES}
            volume={1}
          />
        }
        isMuted={isMuted}
        onRetry={() => onRecord("stream-retry")}
        pixelPerfect
        showStreamTelemetry={showTelemetry}
        status="error"
        telemetry={telemetry}
        videoRef={videoRef}
      />
      {showTelemetry && (
        <StreamTelemetryPanel
          onClose={() => {
            onRecord("telemetry-hidden");
            setShowTelemetry(false);
          }}
          telemetry={telemetry}
        />
      )}
    </section>
  );
}
