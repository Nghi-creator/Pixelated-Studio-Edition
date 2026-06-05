import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { CommentsPanel } from "../../features/player/comments/CommentsPanel";
import { LobbyPanel } from "../../features/player/LobbyPanel";
import { ReportModal } from "../../features/player/comments/ReportModal";
import { useCommentReporting } from "../../features/player/comments/useCommentReporting";
import { useComments } from "../../features/player/comments/useComments";
import { PlayerControls } from "../../features/player/PlayerControls";
import { PlayerHeader } from "../../features/player/PlayerHeader";
import { ReactionButtons } from "../../features/player/ReactionButtons";
import { StreamStage } from "../../features/player/StreamStage";
import { StreamTelemetryPanel } from "../../features/player/StreamTelemetryPanel";
import { useAuthUser } from "../../features/player/useAuthUser";
import { useGameMetadata } from "../../features/player/useGameMetadata";
import { useGameReactions } from "../../features/player/useGameReactions";
import { usePlayCount } from "../../features/player/usePlayCount";
import { api } from "../../lib/apiClient";
import {
  getStreamProfile,
  STREAM_PROFILES,
  STREAM_PROFILE_STORAGE_KEY,
  type StreamProfileId,
} from "../../lib/streamProfiles";
import { useWebRTC } from "../../lib/useWebRTC";

const STREAM_TELEMETRY_VISIBILITY_KEY = "pixelated_show_stream_telemetry";

type PlayerBackState = {
  backRoute?: unknown;
  backText?: unknown;
};

const isPlayerBackState = (state: unknown): state is PlayerBackState =>
  typeof state === "object" && state !== null;

export default function Player() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);

  const [streamProfileId, setStreamProfileId] = useState<StreamProfileId>(() => {
    if (typeof window === "undefined") return "balanced";
    return getStreamProfile(
      window.localStorage.getItem(STREAM_PROFILE_STORAGE_KEY),
    ).id;
  });
  const streamProfile = getStreamProfile(streamProfileId);
  const currentUser = useAuthUser();
  const [profileIdentity, setProfileIdentity] = useState<{
    userId: string;
    username: string | null;
  } | null>(null);
  const lobbySearch = useMemo(
    () => new URLSearchParams(location.search),
    [location.search],
  );
  const invitedSessionId = lobbySearch.get("session");
  const invitedRole =
    lobbySearch.get("role") === "player" ? "player" : "spectator";
  const playerMode = invitedSessionId ? "guest" : "host";
  const profileUsername =
    profileIdentity && profileIdentity.userId === currentUser?.id
      ? profileIdentity.username
      : null;
  const displayName =
    profileUsername ||
    currentUser?.email?.split("@")[0] ||
    (playerMode === "host" ? "Host" : "Guest");
  const {
    inputCapabilities,
    lobbyState,
    kickParticipant,
    localParticipant,
    releasePlayerSlot,
    requestPlayerSlot,
    retry,
    sessionId,
    stream,
    status,
    telemetry,
  } = useWebRTC(id || "", streamProfile, {
    displayName,
    mode: playerMode,
    requestedRole: playerMode === "host" ? "host" : invitedRole,
    sessionId: invitedSessionId,
  });
  const { authorName, gameTitle } = useGameMetadata(id);

  useEffect(() => {
    if (!currentUser) {
      return;
    }

    let isMounted = true;
    api
      .permissions()
      .then(({ profile }) => {
        if (isMounted) {
          setProfileIdentity({
            userId: currentUser.id,
            username: profile.username,
          });
        }
      })
      .catch(() => {
        if (isMounted) {
          setProfileIdentity({
            userId: currentUser.id,
            username: null,
          });
        }
      });

    return () => {
      isMounted = false;
    };
  }, [currentUser]);

  const [showStreamTelemetry, setShowStreamTelemetry] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(STREAM_TELEMETRY_VISIBILITY_KEY) === "1";
  });
  const { dislikes, handleReaction, likes, userReaction } = useGameReactions(
    id,
    currentUser,
  );
  const {
    comments,
    handleCommentReaction,
    handleDeleteComment,
    handlePostComment,
    hasMoreComments,
    isSubmittingComment,
    loadMoreComments,
    newComment,
    setNewComment,
  } = useComments(id, currentUser);
  const {
    closeReportModal,
    handleSubmitReport,
    isSubmittingReport,
    reportReason,
    reportingCommentId,
    setReportingCommentId,
    setReportReason,
  } = useCommentReporting(currentUser);

  usePlayCount(id);

  useEffect(() => {
    window.localStorage.setItem(
      STREAM_TELEMETRY_VISIBILITY_KEY,
      showStreamTelemetry ? "1" : "0",
    );
  }, [showStreamTelemetry]);

  useEffect(() => {
    window.localStorage.setItem(STREAM_PROFILE_STORAGE_KEY, streamProfileId);
  }, [streamProfileId]);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  useEffect(() => {
    const gameKeys = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "];

    const preventScroll = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") {
        return;
      }

      if (gameKeys.includes(event.key)) {
        event.preventDefault();
      }
    };

    window.addEventListener("keydown", preventScroll, {
      passive: false,
      capture: true,
    });

    return () =>
      window.removeEventListener("keydown", preventScroll, { capture: true });
  }, []);

  const isLocalGame = id?.toLowerCase().endsWith(".nes");
  const fallbackBackRoute = isLocalGame ? "/local" : "/";
  const fallbackBackText = isLocalGame
    ? "Back to Local Vault"
    : "Back to Cloud Library";
  const backState = isPlayerBackState(location.state) ? location.state : null;
  const backRoute =
    typeof backState?.backRoute === "string"
      ? backState.backRoute
      : fallbackBackRoute;
  const backText =
    typeof backState?.backText === "string"
      ? backState.backText
      : fallbackBackText;
  const shareUrl = useMemo(() => {
    const nextSearch = new URLSearchParams(location.search);
    nextSearch.set("session", sessionId);
    nextSearch.set("role", "spectator");
    return `${window.location.origin}${location.pathname}?${nextSearch.toString()}`;
  }, [location.pathname, location.search, sessionId]);

  return (
    <div className="flex flex-col items-center pt-24 pb-24 px-4 min-h-screen">
      <PlayerHeader
        backRoute={backRoute}
        backText={backText}
        gameTitle={gameTitle}
        onToggleTelemetry={() =>
          setShowStreamTelemetry((isVisible) => !isVisible)
        }
        showStreamTelemetry={showStreamTelemetry}
        status={status}
      />

      <StreamStage
        onRetry={retry}
        showStreamTelemetry={showStreamTelemetry}
        status={status}
        telemetry={telemetry}
        videoRef={videoRef}
      />

      <div className="mt-3 flex w-full max-w-5xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {authorName ? (
          <p className="text-sm font-medium text-synth-primary">
            Developed by: {authorName}
          </p>
        ) : (
          <span />
        )}

        <LobbyPanel
          currentParticipant={localParticipant}
          inputCapabilities={inputCapabilities}
          lobbyState={lobbyState}
          onKickParticipant={kickParticipant}
          onReleaseSlot={releasePlayerSlot}
          onRequestSlot={requestPlayerSlot}
          shareUrl={shareUrl}
        />
      </div>

      {showStreamTelemetry && (
        <StreamTelemetryPanel
          gameId={id}
          playerMode={playerMode}
          sessionId={sessionId}
          shareUrl={shareUrl}
          status={status}
          telemetry={telemetry}
        />
      )}

      <PlayerControls
        onStreamProfileChange={setStreamProfileId}
        selectedStreamProfileId={streamProfileId}
        streamProfiles={STREAM_PROFILES}
      />

      <CommentsPanel
        comments={comments}
        currentUser={currentUser}
        hasMoreComments={hasMoreComments}
        isSubmittingComment={isSubmittingComment}
        newComment={newComment}
        onCommentReaction={handleCommentReaction}
        onDeleteComment={handleDeleteComment}
        onLoadMore={loadMoreComments}
        onPostComment={handlePostComment}
        onReportComment={setReportingCommentId}
        onSignIn={() => navigate("/login")}
        reactionButtons={
          <ReactionButtons
            dislikes={dislikes}
            likes={likes}
            onReaction={handleReaction}
            userReaction={userReaction}
          />
        }
        setNewComment={setNewComment}
      />

      {reportingCommentId && (
        <ReportModal
          isSubmittingReport={isSubmittingReport}
          onClose={closeReportModal}
          onSubmitReport={handleSubmitReport}
          reportReason={reportReason}
          setReportReason={setReportReason}
        />
      )}
    </div>
  );
}
