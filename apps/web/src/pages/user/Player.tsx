import { useEffect, useRef } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { CommentsPanel } from "../../features/player/comments/components/CommentsPanel";
import { LobbyPanel } from "../../features/player/components/LobbyPanel";
import { ReportModal } from "../../features/player/comments/components/ReportModal";
import { useCommentReporting } from "../../features/player/comments/hooks/useCommentReporting";
import { useComments } from "../../features/player/comments/hooks/useComments";
import {
  PlayerControls,
  PlayerInstructions,
} from "../../features/player/components/PlayerControls";
import { PlayerHeader } from "../../features/player/components/PlayerHeader";
import { ReactionButtons } from "../../features/player/components/ReactionButtons";
import { StreamStage } from "../../features/player/components/StreamStage";
import { StreamTelemetryPanel } from "../../features/player/components/StreamTelemetryPanel";
import { useAuthUser } from "../../features/player/hooks/useAuthUser";
import { useGameMetadata } from "../../features/player/hooks/useGameMetadata";
import { usePlayerIdentity } from "../../features/player/hooks/usePlayerIdentity";
import { usePlayerNavigation } from "../../features/player/hooks/usePlayerNavigation";
import { usePlayerShareInvite } from "../../features/player/hooks/usePlayerShareInvite";
import { usePlayerStreamSettings } from "../../features/player/hooks/usePlayerStreamSettings";
import { useGameReactions } from "../../features/player/hooks/useGameReactions";
import { usePlayCount } from "../../features/player/hooks/usePlayCount";
import { useStreamPlayback } from "../../features/player/hooks/useStreamPlayback";
import { STREAM_PROFILES } from "../../lib/engine/streamProfiles";
import { shouldIgnoreGameInput } from "../../lib/webrtc/webrtcInput";
import { useWebRTC } from "../../lib/webrtc/useWebRTC";

export default function Player() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
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
  } = usePlayerStreamSettings();
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
    telemetry,
  } = useWebRTC(id || "", streamProfile, {
    displayName,
    mode: playerMode,
    requestedRole: playerMode === "host" ? "host" : invitedRole,
    sessionId: invitedSessionId,
  });
  const { authorName, gameRights, gameTitle } = useGameMetadata(id);
  const {
    dislikes,
    handleReaction,
    isReactionLoading,
    likes,
    reactionError,
    retryReactions,
    userReaction,
  } = useGameReactions(id, currentUser);
  const {
    comments,
    commentsError,
    handleCommentReaction,
    handleDeleteComment,
    handlePostComment,
    hasMoreComments,
    isLoadingComments,
    isLoadingMoreComments,
    isSubmittingComment,
    loadMoreComments,
    newComment,
    pendingCommentIds,
    retryComments,
    setNewComment,
  } = useComments(id, currentUser);
  const {
    closeReportModal,
    handleSubmitReport,
    isSubmittingReport,
    openReportModal,
    reportError,
    reportMessage,
    reportReason,
    reportingCommentId,
    setReportReason,
  } = useCommentReporting(currentUser);

  usePlayCount(id);
  const fallbackActive = useStreamPlayback({
    isMuted,
    onBlackFrameStall: reportBlackFrameStall,
    setIsMuted,
    status,
    stream,
    videoRef,
  });

  useEffect(() => {
    const gameKeys = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "];

    const preventScroll = (event: KeyboardEvent) => {
      if (!shouldIgnoreGameInput(event) && gameKeys.includes(event.key)) {
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

      <div
        className={`grid w-full gap-4 transition-[max-width,grid-template-columns] duration-300 ${
          showStreamTelemetry
            ? `${playerLayoutClassName} xl:grid-cols-[minmax(0,1fr)_18rem]`
            : playerLayoutClassName
        }`}
      >
        <StreamStage
          controls={
            <PlayerControls
              gameTitle={gameTitle}
              isMuted={isMuted}
              onMuteToggle={() => setIsMuted((muted) => !muted)}
              onStreamProfileChange={setStreamProfileId}
              onToggleTelemetry={() =>
                setShowStreamTelemetry((isVisible) => !isVisible)
              }
              selectedStreamProfileId={streamProfileId}
              showStreamTelemetry={showStreamTelemetry}
              streamProfiles={STREAM_PROFILES}
            />
          }
          fallbackActive={fallbackActive}
          isMuted={isMuted}
          onRetry={retry}
          showStreamTelemetry={showStreamTelemetry}
          status={status}
          telemetry={telemetry}
          videoRef={videoRef}
        />

        {showStreamTelemetry && (
          <StreamTelemetryPanel
            gameId={id}
            onClose={() => setShowStreamTelemetry(false)}
            playerMode={playerMode}
            sessionId={sessionId}
            shareUrl={shareInvite.url}
            status={status}
            telemetry={telemetry}
          />
        )}
      </div>

      <div className={`mt-3 flex w-full ${playerLayoutClassName}`}>
        {authorName ? (
          <p className="text-sm font-medium text-synth-primary">
            Developed by: {authorName}
          </p>
        ) : (
          <span />
        )}
      </div>

      <PlayerInstructions
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

      <CommentsPanel
        comments={comments}
        commentsError={commentsError}
        currentUser={currentUser}
        hasMoreComments={hasMoreComments}
        isLoadingComments={isLoadingComments}
        isLoadingMoreComments={isLoadingMoreComments}
        isSubmittingComment={isSubmittingComment}
        newComment={newComment}
        onCommentReaction={handleCommentReaction}
        onDeleteComment={handleDeleteComment}
        onLoadMore={loadMoreComments}
        onPostComment={handlePostComment}
        onReportComment={openReportModal}
        onRetryComments={retryComments}
        onSignIn={() => navigate("/login")}
        pendingCommentIds={pendingCommentIds}
        reactionButtons={
          <ReactionButtons
            dislikes={dislikes}
            error={reactionError}
            isLoading={isReactionLoading}
            likes={likes}
            onReaction={handleReaction}
            onRetry={retryReactions}
            userReaction={userReaction}
          />
        }
        reportMessage={reportMessage}
        setNewComment={setNewComment}
      />

      {reportingCommentId && (
        <ReportModal
          error={reportError}
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
