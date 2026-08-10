import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { LobbyPanel } from "../../features/player/components/stream/LobbyPanel";
import { KeyboardMappingDrawer } from "../../features/player/components/stream/KeyboardMappingDrawer";
import { PlayerControls } from "../../features/player/components/shell/PlayerControls";
import { PlayerHeader } from "../../features/player/components/shell/PlayerHeader";
import { StreamStage } from "../../features/player/components/stream/StreamStage";
import {
  PlayerRecordingStatusButton,
  PlayerStreamGrid,
} from "../../features/player/components/shell/PlayerStreamGrid";
import { useAuthUser } from "../../features/player/hooks/data/useAuthUser";
import { useGameMetadata } from "../../features/player/hooks/data/useGameMetadata";
import { usePlayerIdentity } from "../../features/player/hooks/navigation/usePlayerIdentity";
import { usePlayerNavigation } from "../../features/player/hooks/navigation/usePlayerNavigation";
import { usePlayerShareInvite } from "../../features/player/hooks/navigation/usePlayerShareInvite";
import { usePlayerStreamSettings } from "../../features/player/hooks/playback/usePlayerStreamSettings";
import { usePlayCount } from "../../features/player/hooks/data/usePlayCount";
import { useStreamPlayback } from "../../features/player/hooks/playback/useStreamPlayback";
import { useResearchRunState } from "../../features/player/hooks/research/useResearchRunState";
import { useResearchRunExports } from "../../features/player/hooks/research/useResearchRunExports";
import { useStreamTelemetryRecording } from "../../features/player/hooks/telemetry/useStreamTelemetryRecording";
import { useEngineResearchTelemetryRecording } from "../../features/player/hooks/telemetry/useEngineResearchTelemetryRecording";
import { usePreventGameInputScroll } from "../../features/player/hooks/playback/usePreventGameInputScroll";
import { STREAM_PROFILES } from "../../lib/engine/streamProfiles";
import { useWebRTC } from "../../features/player/hooks/webrtc/useWebRTC";
import { ResearchModeBanner } from "../../features/research-mode/components/ResearchModeBanner";
import { ResearchRunHud } from "../../features/research-mode/components/ResearchRunHud";
import { ResearchRunResults } from "../../features/research-mode/components/ResearchRunResults";
import { getPlayerExperiencePolicy } from "../../features/research-mode/playerExperience";
import type { PlayerExperience } from "../../features/research-mode/researchRoutes";
import {
  createDefaultResearchRunConfig,
  type ResearchRunConfig,
} from "../../features/research-mode/researchRunConfig";
import {
  clearActiveResearchRun,
  readActiveResearchRun,
  writeActiveResearchRun,
} from "../../features/research-mode/researchRunConfigStorage";
import { useResearchRunController } from "../../features/research-mode/useResearchRunController";
import { createResearchRunId } from "../../features/player/research/researchRunMetadata";

const PlayerCommunitySection = lazy(() =>
  import("../../features/player/components/community/PlayerCommunitySection").then(
    ({ PlayerCommunitySection }) => ({ default: PlayerCommunitySection }),
  ),
);
const StreamTelemetryPanel = lazy(() =>
  import("../../features/player/components/telemetry/StreamTelemetryPanel").then(
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

export default function Player({
  experience = "normal",
}: {
  experience?: PlayerExperience;
}) {
  const { id } = useParams<{ id: string }>();
  const [researchConfig] = useState<ResearchRunConfig | null>(() =>
    experience === "research"
      ? readActiveResearchRun(window.sessionStorage, id)
      : null,
  );

  if (experience === "research" && !researchConfig) {
    return <MissingResearchRunSetup gameId={id} />;
  }

  return (
    <PlayerExperience
      experience={experience}
      gameId={id}
      researchConfig={researchConfig}
    />
  );
}

function MissingResearchRunSetup({ gameId }: { gameId?: string }) {
  const navigate = useNavigate();

  return (
    <div className="mx-auto min-h-screen w-full max-w-3xl px-4 pt-28">
      <ResearchModeBanner allowExit={false} />
      <section className="mt-6 rounded-lg border border-synth-border bg-synth-surface p-6 text-center shadow-panel">
        <h1 className="text-2xl font-extrabold text-white">
          Research setup required
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-gray-300">
          This player only starts from a validated, session-scoped run setup.
          Configure the phase and capture timing before connecting to the game.
        </p>
        <button
          className="mt-5 rounded-lg border border-synth-action-hover bg-synth-action px-5 py-2.5 font-bold text-white transition-colors hover:brightness-110"
          onClick={() => navigate(`/research/games/${gameId || ""}/setup`)}
          type="button"
        >
          Open run setup
        </button>
      </section>
    </div>
  );
}

function PlayerExperience({
  experience,
  gameId: id,
  researchConfig,
}: {
  experience: PlayerExperience;
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
  } = usePlayerStreamSettings({
    isMuted: researchConfig?.audioMuted,
    persistStreamProfile: experience !== "research",
    streamProfileId: researchConfig?.streamProfileId,
    volume: researchConfig?.audioVolume,
  });
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
    startCsvRecording,
    stopCsvRecording,
    toggleCsvRecording,
  } = useStreamTelemetryRecording({
    gameId: id,
    playerMode,
    sessionId,
    status,
    telemetry,
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

  const resetTelemetryData = useCallback(() => {
    clearTelemetryCsv();
    clearResearchEvents();
  }, [clearResearchEvents, clearTelemetryCsv]);

  const [controllerConfig] = useState(() =>
    researchConfig || createDefaultResearchRunConfig(id || ""),
  );
  const engineTelemetryRecording = useEngineResearchTelemetryRecording({
    enabled: experience === "research",
    gameId: id || "",
    isRecording: isRecordingCsv,
    runId: researchRunId,
    sessionId,
  });
  const researchController = useResearchRunController({
    config: controllerConfig,
    computeSampleCount: engineTelemetryRecording.validComputeSampleCount,
    currentProfileId: streamProfileId,
    enabled: experience === "research",
    firstFrameObserved: visibleFrameGameId === id,
    isConnectionReady:
      status === "playing" &&
      telemetry.connectionState === "connected" &&
      telemetry.iceConnectionState === "connected",
    isRecording: isRecordingCsv,
    onResetCapture: resetTelemetryData,
    onStartRecording: startCsvRecording,
    onStopRecording: stopCsvRecording,
    recordEvent: recordResearchEvent,
    requiresComputeTelemetry:
      experience === "research" &&
      controllerConfig.scenario !== "browser_only_baseline",
    sampleCount: recordedCsvSamples.length,
    sessionId,
  });

  usePreventGameInputScroll();

  const shareInvite = usePlayerShareInvite({
    location,
    sessionId,
    shareContext,
  });
  const { canExportBundle, exportBundle } = useResearchRunExports({
    baselineForm: researchBaselineForm,
    events: researchEvents,
    form: researchMetadataForm,
    gameId: id,
    gameTitle,
    history: [],
    playerMode,
    recordedEngineSamples: engineTelemetryRecording.recordedEngineSamples,
    recordedCsvSnapshot: {
      revision: recordedCsvRevision,
      samples: recordedCsvSamples,
    },
    runId: researchRunId,
    sessionId,
    shareUrl: experiencePolicy.allowLobbyAndSharing ? shareInvite.url : "",
    status,
    streamProfile,
  });
  const playerLayoutClassName = showStreamTelemetry
    ? "max-w-7xl"
    : "max-w-5xl";

  return (
    <div className="flex flex-col items-center pt-24 pb-24 px-4 min-h-screen">
      {experience === "research" && (
        <div className="w-full max-w-5xl">
          <ResearchModeBanner allowExit={false} compact />
          <ResearchRunHud
            config={controllerConfig}
            computeSampleCount={engineTelemetryRecording.validComputeSampleCount}
            onCancel={researchController.cancel}
            onStop={researchController.stopEarly}
            remainingMs={researchController.remainingMs}
            sampleCount={recordedCsvSamples.length}
            state={researchController.state}
          />
        </div>
      )}
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
              shareUrl={
                experiencePolicy.allowLobbyAndSharing ? shareInvite.url : ""
              }
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
              canRestartSession={playerMode === "host" && status === "idle"}
              canResetSession={playerMode === "host"}
              canStopSession={playerMode === "host" && status === "playing"}
              gameTitle={gameTitle}
              isPlaybackPaused={status === "playing" && isPlaybackPaused}
              isMuted={isMuted}
              audioControlsDisabled={experience === "research"}
              showLobbyControls={experiencePolicy.allowLobbyAndSharing}
              streamProfileLocked={experience === "research"}
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

      {experience === "research" &&
        (researchController.state.stage === "completed" ||
          researchController.state.stage === "invalid" ||
          researchController.state.stage === "cancelled") && (
          <ResearchRunResults
            canExport={canExportBundle}
            config={controllerConfig}
            computeSampleCount={engineTelemetryRecording.validComputeSampleCount}
            latestEncoderSample={engineTelemetryRecording.latestEncoderSample}
            latestEngineSample={engineTelemetryRecording.latestEngineSample}
            onExport={() => void exportBundle()}
            onRetake={() => {
              const nextConfig = {
                ...controllerConfig,
                runId: createResearchRunId(),
              };
              writeActiveResearchRun(window.sessionStorage, nextConfig);
              navigate(`/research/games/${id || ""}/setup`);
            }}
            onReturnToLibrary={() => {
              clearActiveResearchRun(window.sessionStorage);
              navigate("/home");
            }}
            state={researchController.state}
            telemetry={telemetry}
          />
        )}

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
