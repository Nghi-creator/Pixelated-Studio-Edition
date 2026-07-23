import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { LobbyPanel } from "../../features/player/components/LobbyPanel";
import {
  PlayerControls,
  PlayerInstructions,
} from "../../features/player/components/PlayerControls";
import { PlayerHeader } from "../../features/player/components/PlayerHeader";
import { StreamStage } from "../../features/player/components/StreamStage";
import {
  PlayerRecordingStatusButton,
  PlayerStreamGrid,
} from "../../features/player/components/PlayerStreamGrid";
import { useAuthUser } from "../../features/player/hooks/useAuthUser";
import { useGameMetadata } from "../../features/player/hooks/useGameMetadata";
import { usePlayerIdentity } from "../../features/player/hooks/usePlayerIdentity";
import { usePlayerNavigation } from "../../features/player/hooks/usePlayerNavigation";
import { usePlayerShareInvite } from "../../features/player/hooks/usePlayerShareInvite";
import { usePlayerStreamSettings } from "../../features/player/hooks/usePlayerStreamSettings";
import { usePlayCount } from "../../features/player/hooks/usePlayCount";
import { useStreamPlayback } from "../../features/player/hooks/useStreamPlayback";
import { useResearchRunState } from "../../features/player/hooks/useResearchRunState";
import { useStreamTelemetryRecording } from "../../features/player/hooks/useStreamTelemetryRecording";
import { usePreventGameInputScroll } from "../../features/player/hooks/usePreventGameInputScroll";
import { STREAM_PROFILES } from "../../lib/engine/streamProfiles";
import { useWebRTC } from "../../lib/webrtc/useWebRTC";

const PlayerCommunitySection = lazy(() =>
  import("../../features/player/components/PlayerCommunitySection").then(
    ({ PlayerCommunitySection }) => ({ default: PlayerCommunitySection }),
  ),
);
const StreamTelemetryPanel = lazy(() =>
  import("../../features/player/components/StreamTelemetryPanel").then(
    ({ StreamTelemetryPanel }) => ({ default: StreamTelemetryPanel }),
  ),
);

function PlayerSectionLoading({ label }: { label: string }) {
  return (
    <div
      aria-live="polite"
      className="flex min-h-32 w-full items-center justify-center rounded-lg border border-synth-border bg-synth-surface px-4 text-sm font-semibold text-gray-300"
      role="status"
    >
      {label}
    </div>
  );
}

export default function Player() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamStageRef = useRef<HTMLDivElement>(null);
  const [isPlaybackPaused, setIsPlaybackPaused] = useState(false);
  const [pixelPerfect, setPixelPerfect] = useState(true);
  const currentUser = useAuthUser();
  const { backRoute, backText, lobbySearch } = usePlayerNavigation(
    location,
    id,
  );
  const invitedSessionId = lobbySearch.get("session");
  const invitedRole =
    lobbySearch.get("role") === "player" ? "player" : "spectator";
  const playerMode = invitedSessionId ? "guest" : "host";
  const displayName = usePlayerIdentity(currentUser, playerMode);
  const {
    isMuted,
    setIsMuted,
    setShowStreamTelemetry,
    setStreamProfileId,
    showStreamTelemetry,
    streamProfile,
    streamProfileId,
    setVolume,
    volume,
  } = usePlayerStreamSettings();
  const {
    baselineForm: researchBaselineForm,
    clearEvents: clearResearchEvents,
    events: researchEvents,
    metadataForm: researchMetadataForm,
    recordEvent: recordResearchEvent,
    runId: researchRunId,
    setBaselineForm: setResearchBaselineForm,
    setMetadataForm: setResearchMetadataForm,
    setSessionId: setResearchSessionId,
  } = useResearchRunState({
    gameId: id,
    playerMode,
  });
  const {
    inputCapabilities,
    lobbyState,
    kickParticipant,
    localParticipant,
    releasePlayerSlot,
    requestPlayerSlot,
    retry,
    reportBlackFrameStall,
    sessionId,
    shareContext,
    stream,
    status,
    stop,
    telemetry,
  } = useWebRTC(id || "", streamProfile, {
    displayName,
    mode: playerMode,
    onResearchEvent: recordResearchEvent,
    requestedRole: playerMode === "host" ? "host" : invitedRole,
    sessionId: invitedSessionId,
  });
  const {
    clearTelemetryCsv,
    csvStatusText,
    csvStatusTitle,
    isRecordingCsv,
    recordedCsvSamples,
    recordedCsvRevision,
    toggleCsvRecording,
  } = useStreamTelemetryRecording({
    gameId: id,
    playerMode,
    sessionId,
    status,
    telemetry,
  });
  const { authorName, gameRights, gameTitle } = useGameMetadata(id);

  usePlayCount(id);
  const handleFirstVisibleFrame = useCallback(() => {
    recordResearchEvent("first_non_black_frame");
  }, [recordResearchEvent]);
  const fallbackActive = useStreamPlayback({
    isMuted,
    onBlackFrameStall: reportBlackFrameStall,
    onFirstVisibleFrame: handleFirstVisibleFrame,
    setIsMuted,
    status,
    stream,
    videoRef,
  });

  useEffect(() => {
    setResearchSessionId(sessionId);
  }, [sessionId, setResearchSessionId]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.volume = volume;
  }, [stream, volume]);

  const togglePlaybackPause = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play();
      setIsPlaybackPaused(false);
      return;
    }
    video.pause();
    setIsPlaybackPaused(true);
  };

  const resetSession = () => {
    setIsPlaybackPaused(false);
    retry();
  };

  const stopSession = () => {
    setIsPlaybackPaused(false);
    stop();
  };

  const resetTelemetryData = () => {
    clearTelemetryCsv();
    clearResearchEvents();
  };

  usePreventGameInputScroll();

  const shareInvite = usePlayerShareInvite({
    location,
    sessionId,
    shareContext,
  });
  const playerLayoutClassName = showStreamTelemetry
    ? "max-w-7xl"
    : "max-w-5xl";

  return (
    <div className="flex flex-col items-center pt-24 pb-24 px-4 min-h-screen">
      <PlayerHeader
        backRoute={backRoute}
        backText={backText}
        gameRights={gameRights}
        gameTitle={gameTitle}
        hideGameChrome
        layoutClassName={playerLayoutClassName}
        onToggleTelemetry={() =>
          setShowStreamTelemetry((isVisible) => !isVisible)
        }
        showStreamTelemetry={showStreamTelemetry}
        status={status}
      />

      <PlayerStreamGrid
        layoutClassName={playerLayoutClassName}
        showStreamTelemetry={showStreamTelemetry}
        telemetryPanel={
          <Suspense fallback={<PlayerSectionLoading label="Loading stream stats…" />}>
            <StreamTelemetryPanel
              gameId={id || ""}
              gameTitle={gameTitle}
              isRecordingCsv={isRecordingCsv}
              onClearTelemetryCsv={clearTelemetryCsv}
              onClose={() => setShowStreamTelemetry(false)}
              onResetTelemetryData={resetTelemetryData}
              onToggleCsvRecording={toggleCsvRecording}
              playerMode={playerMode}
              researchRun={{
                baselineForm: researchBaselineForm,
                events: researchEvents,
                metadataForm: researchMetadataForm,
                onBaselineFormChange: setResearchBaselineForm,
                onMetadataFormChange: setResearchMetadataForm,
                runId: researchRunId,
              }}
              recordedCsvSamples={recordedCsvSamples}
              recordedCsvRevision={recordedCsvRevision}
              sessionId={sessionId}
              shareUrl={shareInvite.url}
              status={status}
              streamProfile={streamProfile}
              telemetry={telemetry}
            />
          </Suspense>
        }
      >
        <StreamStage
          controls={
            <PlayerControls
              canPauseStream={status === "playing"}
              canResetSession={playerMode === "host"}
              canStopSession={playerMode === "host" && status === "playing"}
              gameTitle={gameTitle}
              isPlaybackPaused={status === "playing" && isPlaybackPaused}
              isMuted={isMuted}
              onFullscreen={() => void streamStageRef.current?.requestFullscreen()}
              onMuteToggle={() => setIsMuted((muted) => !muted)}
              onPauseToggle={togglePlaybackPause}
              onPixelPerfectChange={setPixelPerfect}
              onReset={resetSession}
              onStop={stopSession}
              onStreamProfileChange={setStreamProfileId}
              onToggleTelemetry={() =>
                setShowStreamTelemetry((isVisible) => !isVisible)
              }
              onVolumeChange={setVolume}
              pixelPerfect={pixelPerfect}
              selectedStreamProfileId={streamProfileId}
              showStreamTelemetry={showStreamTelemetry}
              streamProfiles={STREAM_PROFILES}
              volume={volume}
            />
          }
          fallbackActive={fallbackActive}
          isMuted={isMuted}
          onRetry={retry}
          pixelPerfect={pixelPerfect}
          showStreamTelemetry={showStreamTelemetry}
          stageRef={streamStageRef}
          status={status}
          telemetry={telemetry}
          videoRef={videoRef}
        />
      </PlayerStreamGrid>

      <div
        className={`mt-3 flex w-full flex-wrap items-center justify-between gap-2 ${playerLayoutClassName}`}
      >
        {authorName ? (
          <p className="text-sm font-medium text-synth-primary">
            Developed by: {authorName}
          </p>
        ) : (
          <span />
        )}
        <PlayerRecordingStatusButton
          csvStatusText={csvStatusText}
          csvStatusTitle={csvStatusTitle}
          isVisible={isRecordingCsv || recordedCsvSamples.length > 0}
          onOpen={() => setShowStreamTelemetry(true)}
        />
      </div>

      <PlayerInstructions
        layoutClassName={playerLayoutClassName}
        lobby={
          <LobbyPanel
            currentParticipant={localParticipant}
            inputCapabilities={inputCapabilities}
            lobbyState={lobbyState}
            onKickParticipant={kickParticipant}
            onReleaseSlot={releasePlayerSlot}
            onRequestSlot={requestPlayerSlot}
            shareGuidance={shareInvite.guidance}
            shareText={shareInvite.text}
            shareUrl={shareInvite.url}
          />
        }
      />

      <Suspense fallback={<PlayerSectionLoading label="Loading community…" />}>
        <PlayerCommunitySection
          currentUser={currentUser}
          gameId={id}
          layoutClassName={playerLayoutClassName}
          onSignIn={() => navigate("/login")}
        />
      </Suspense>
    </div>
  );
}
