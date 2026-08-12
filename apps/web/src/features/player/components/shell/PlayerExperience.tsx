import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { STREAM_PROFILES } from "../../../../lib/engine/streamProfiles";
import type { PlayerExperience as PlayerExperienceKind } from "../../../research-mode/researchRoutes";
import type { ResearchRunConfig } from "../../../research-mode/researchRunConfig";
import {
  clearActiveResearchRun,
  writeActiveResearchRun,
} from "../../../research-mode/researchRunConfigStorage";
import { KeyboardMappingDrawer } from "../stream/KeyboardMappingDrawer";
import { LobbyPanel } from "../stream/LobbyPanel";
import { StreamStage } from "../stream/StreamStage";
import { ResearchPlayerOutput } from "../research/ResearchPlayerOutput";
import { useAuthUser } from "../../hooks/data/useAuthUser";
import { useGameMetadata } from "../../hooks/data/useGameMetadata";
import { usePlayCount } from "../../hooks/data/usePlayCount";
import { usePlayerIdentity } from "../../hooks/navigation/usePlayerIdentity";
import { usePlayerNavigation } from "../../hooks/navigation/usePlayerNavigation";
import { usePlayerShareInvite } from "../../hooks/navigation/usePlayerShareInvite";
import { usePlayerStreamSettings } from "../../hooks/playback/usePlayerStreamSettings";
import { usePreventGameInputScroll } from "../../hooks/playback/usePreventGameInputScroll";
import { useStreamPlayback } from "../../hooks/playback/useStreamPlayback";
import { usePlayerResearchSession } from "../../hooks/research/usePlayerResearchSession";
import { useResearchRunState } from "../../hooks/research/useResearchRunState";
import { useWebRTC } from "../../hooks/webrtc/useWebRTC";
import { createResearchRunId } from "../../research/researchRunMetadata";
import { getPlayerExperiencePolicy } from "../../../research-mode/playerExperience";
import { PlayerControls } from "./PlayerControls";
import { PlayerHeader } from "./PlayerHeader";
import {
  PlayerRecordingStatusButton,
  PlayerStreamGrid,
} from "./PlayerStreamGrid";

const PlayerCommunitySection = lazy(() =>
  import("../community/PlayerCommunitySection").then(
    ({ PlayerCommunitySection }) => ({ default: PlayerCommunitySection }),
  ),
);
const StreamTelemetryPanel = lazy(() =>
  import("../telemetry/StreamTelemetryPanel").then(
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

export function PlayerExperience({
  experience,
  gameId: id,
  researchConfig,
}: {
  experience: PlayerExperienceKind;
  gameId: string | undefined;
  researchConfig: ResearchRunConfig | null;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamStageRef = useRef<HTMLDivElement>(null);
  const [isPlaybackPaused, setIsPlaybackPaused] = useState(false);
  const [pixelPerfect, setPixelPerfect] = useState(true);
  const [visibleFrameGameId, setVisibleFrameGameId] = useState<string | null>(null);
  const [activePlayerTool, setActivePlayerTool] = useState<
    "keyboard" | "lobby" | null
  >(null);
  const experiencePolicy = getPlayerExperiencePolicy(experience);
  const currentUser = useAuthUser();
  const { backRoute, backText, lobbySearch } = usePlayerNavigation(location, id);
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
  } = usePlayerStreamSettings({
    isMuted: researchConfig?.audioMuted,
    persistStreamProfile: experience !== "research",
    streamProfileId: researchConfig?.streamProfileId,
    volume: researchConfig?.audioVolume,
  });
  const researchState = useResearchRunState({
    gameId: id,
    initialMetadataForm: researchConfig
      ? {
          coldStart: researchConfig.coldStart,
          networkType: researchConfig.networkType,
          notes: researchConfig.notes,
          scenario: researchConfig.scenario,
        }
      : undefined,
    playerMode,
    requestedRunId: researchConfig?.runId,
  });
  const { recordEvent: recordResearchEvent, setSessionId: setResearchSessionId } =
    researchState;
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
  const { authorName, gameRights, gameTitle } = useGameMetadata(id);

  usePlayCount(
    id,
    experiencePolicy.recordPlayCount && Boolean(id && visibleFrameGameId === id),
  );
  const handleFirstVisibleFrame = useCallback(() => {
    setVisibleFrameGameId(id || null);
    recordResearchEvent("first_non_black_frame");
  }, [id, recordResearchEvent]);
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

  usePreventGameInputScroll();

  const shareInvite = usePlayerShareInvite({ location, sessionId, shareContext });
  const researchSession = usePlayerResearchSession({
    experience,
    firstFrameObserved: visibleFrameGameId === id,
    gameId: id,
    gameTitle,
    playerMode,
    researchConfig,
    researchState,
    sessionId,
    shareUrl: experiencePolicy.allowLobbyAndSharing ? shareInvite.url : "",
    status,
    streamProfile,
    streamProfileId,
    telemetry,
  });
  const isStreamTelemetryVisible =
    experiencePolicy.showStreamTelemetryControls && showStreamTelemetry;
  const playerLayoutClassName = isStreamTelemetryVisible
    ? "max-w-7xl"
    : "max-w-5xl";

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
  const retakeResearchPhase = () => {
    writeActiveResearchRun(window.sessionStorage, {
      ...researchSession.config,
      runId: createResearchRunId(),
    });
    navigate(`/research/games/${id || ""}/setup`);
  };
  const returnToResearchLibrary = () => {
    clearActiveResearchRun(window.sessionStorage);
    navigate("/home");
  };

  return (
    <div className="flex min-h-screen flex-col items-center px-4 pt-24 pb-24">
      <PlayerHeader
        backRoute={backRoute}
        backText={backText}
        gameRights={gameRights}
        gameTitle={gameTitle}
        hideGameChrome
        layoutClassName={playerLayoutClassName}
        status={status}
      />

      <PlayerStreamGrid
        layoutClassName={playerLayoutClassName}
        showStreamTelemetry={isStreamTelemetryVisible}
        telemetryPanel={
          <Suspense fallback={<PlayerSectionLoading label="Loading stream stats…" />}>
            <StreamTelemetryPanel
              onClose={() => setShowStreamTelemetry(false)}
              telemetry={telemetry}
            />
          </Suspense>
        }
      >
        <StreamStage
          controls={
            <PlayerControls
              audioControlsDisabled={experience === "research"}
              canPauseStream={status === "playing"}
              canRestartSession={playerMode === "host" && status === "idle"}
              canResetSession={playerMode === "host"}
              canStopSession={playerMode === "host" && status === "playing"}
              gameTitle={gameTitle}
              isMuted={isMuted}
              isPlaybackPaused={status === "playing" && isPlaybackPaused}
              lobbyParticipantCount={
                status === "playing" ? lobbyState?.participants.length || 0 : 0
              }
              onFullscreen={() => void streamStageRef.current?.requestFullscreen()}
              onMuteToggle={() => setIsMuted((muted) => !muted)}
              onOpenKeyboard={() => setActivePlayerTool("keyboard")}
              onOpenLobby={() => setActivePlayerTool("lobby")}
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
              showLobbyControls={experiencePolicy.allowLobbyAndSharing}
              showStreamTelemetry={isStreamTelemetryVisible}
              showTelemetryControl={
                experiencePolicy.showStreamTelemetryControls
              }
              streamProfileLocked={experience === "research"}
              streamProfiles={STREAM_PROFILES}
              volume={volume}
            />
          }
          fallbackActive={fallbackActive}
          isMuted={isMuted}
          onRetry={retry}
          pixelPerfect={pixelPerfect}
          showStreamTelemetry={isStreamTelemetryVisible}
          stageRef={streamStageRef}
          status={status}
          telemetry={telemetry}
          videoRef={videoRef}
        />
      </PlayerStreamGrid>

      {experience === "research" && (
        <ResearchPlayerOutput
          layoutClassName={playerLayoutClassName}
          onRetake={retakeResearchPhase}
          onReturnToLibrary={returnToResearchLibrary}
          session={researchSession}
          telemetry={telemetry}
        />
      )}

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
          csvStatusText={researchSession.recording.csvStatusText}
          csvStatusTitle={researchSession.recording.csvStatusTitle}
          isVisible={
            experience === "research" &&
            (researchSession.recording.isRecordingCsv ||
              researchSession.recording.recordedCsvSamples.length > 0)
          }
          onOpen={() => setShowStreamTelemetry(true)}
        />
      </div>

      {experiencePolicy.allowLobbyAndSharing && (
        <LobbyPanel
          currentParticipant={localParticipant}
          inputCapabilities={inputCapabilities}
          isOpen={activePlayerTool === "lobby"}
          lobbyState={lobbyState}
          onClose={() => setActivePlayerTool(null)}
          onKickParticipant={kickParticipant}
          onReleaseSlot={releasePlayerSlot}
          onRequestSlot={requestPlayerSlot}
          shareGuidance={shareInvite.guidance}
          shareText={shareInvite.text}
          shareUrl={shareInvite.url}
        />
      )}
      {activePlayerTool === "keyboard" && (
        <KeyboardMappingDrawer onClose={() => setActivePlayerTool(null)} />
      )}

      {experiencePolicy.showCommunity && (
        <Suspense fallback={<PlayerSectionLoading label="Loading community…" />}>
          <PlayerCommunitySection
            currentUser={currentUser}
            gameId={id}
            layoutClassName={playerLayoutClassName}
            onSignIn={() => navigate("/login")}
          />
        </Suspense>
      )}
    </div>
  );
}
