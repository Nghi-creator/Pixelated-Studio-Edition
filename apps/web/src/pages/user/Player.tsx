import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CommentsPanel } from "../../features/player/comments/CommentsPanel";
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
import { EnginePairingPanel } from "../../features/local-engine/EnginePairingPanel";
import { ENGINE_PAIRING_EVENT, hasEngineToken } from "../../lib/engineAuth";
import {
  getStreamProfile,
  STREAM_PROFILES,
  STREAM_PROFILE_STORAGE_KEY,
  type StreamProfileId,
} from "../../lib/streamProfiles";
import { useWebRTC } from "../../lib/useWebRTC";

const STREAM_TELEMETRY_VISIBILITY_KEY = "pixelated_show_stream_telemetry";

export default function Player() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);

  const [streamProfileId, setStreamProfileId] = useState<StreamProfileId>(() => {
    if (typeof window === "undefined") return "balanced";
    return getStreamProfile(
      window.localStorage.getItem(STREAM_PROFILE_STORAGE_KEY),
    ).id;
  });
  const streamProfile = getStreamProfile(streamProfileId);
  const { retry, stream, status, telemetry } = useWebRTC(
    id || "",
    streamProfile,
  );
  const [isEnginePaired, setIsEnginePaired] = useState(hasEngineToken);
  const currentUser = useAuthUser();
  const { authorName, gameTitle } = useGameMetadata(id);
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
    const refreshEnginePairing = () => setIsEnginePaired(hasEngineToken());
    window.addEventListener(ENGINE_PAIRING_EVENT, refreshEnginePairing);

    return () =>
      window.removeEventListener(ENGINE_PAIRING_EVENT, refreshEnginePairing);
  }, []);

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
  const backRoute = isLocalGame ? "/local" : "/";
  const backText = isLocalGame
    ? "Back to Local Vault"
    : "Back to Cloud Library";

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

      {!isEnginePaired && (
        <div className="mb-5 w-full max-w-5xl">
          <EnginePairingPanel
            compact
            onPaired={() => setIsEnginePaired(true)}
          />
        </div>
      )}

      <StreamStage
        onRetry={retry}
        showStreamTelemetry={showStreamTelemetry}
        status={status}
        telemetry={telemetry}
        videoRef={videoRef}
      />

      {showStreamTelemetry && <StreamTelemetryPanel telemetry={telemetry} />}

      <PlayerControls
        authorName={authorName}
        onStreamProfileChange={setStreamProfileId}
        reactionButtons={
          <ReactionButtons
            dislikes={dislikes}
            likes={likes}
            onReaction={handleReaction}
            userReaction={userReaction}
          />
        }
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
