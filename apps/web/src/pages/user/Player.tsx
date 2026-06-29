import { useEffect, useMemo, useRef, useState } from "react";
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
import { useGameReactions } from "../../features/player/hooks/useGameReactions";
import { usePlayCount } from "../../features/player/hooks/usePlayCount";
import { api } from "../../lib/api/apiClient";
import {
  getStreamProfile,
  STREAM_PROFILES,
  STREAM_PROFILE_STORAGE_KEY,
  type StreamProfileId,
} from "../../lib/engine/streamProfiles";
import { shouldIgnoreGameInput } from "../../lib/webrtc/webrtcInput";
import { useWebRTC } from "../../lib/webrtc/useWebRTC";

const STREAM_TELEMETRY_VISIBILITY_KEY = "pixelated_show_stream_telemetry";
const BLACK_VIDEO_SAMPLE_THRESHOLD = 6;
const FALLBACK_BAD_SAMPLE_COUNT = 3;
const FALLBACK_HEALTHY_SAMPLE_COUNT = 4;

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
  const [isMuted, setIsMuted] = useState(true);
  const [fallbackActive, setFallbackActive] = useState(false);

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
  const isLocalGame = /\.(nes|gb|gbc|gba|sfc|smc|md|gen|sms|gg)$/i.test(
    id || "",
  );
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
    const video = videoRef.current;
    if (!video) return;

    video.srcObject = stream;
    if (!stream) return;

    video.muted = isMuted;
    video.play().catch((err) => {
      console.warn("[WebRTC] Browser blocked stream playback:", err);
    });
  }, [isMuted, stream]);

  useEffect(() => {
    if (status !== "playing") {
      setFallbackActive(false);
      return;
    }

    let blackSamples = 0;
    let healthySamples = 0;
    const canvas = document.createElement("canvas");
    canvas.width = 16;
    canvas.height = 16;
    const context = canvas.getContext("2d", { willReadFrequently: true });

    const interval = window.setInterval(() => {
      const video = videoRef.current;
      if (!video || !context || video.videoWidth === 0 || video.videoHeight === 0) {
        blackSamples += 1;
        healthySamples = 0;
      } else {
        try {
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
          let total = 0;
          for (let index = 0; index < pixels.length; index += 4) {
            total += pixels[index] + pixels[index + 1] + pixels[index + 2];
          }
          const average = total / (pixels.length / 4) / 3;
          if (average < BLACK_VIDEO_SAMPLE_THRESHOLD) {
            blackSamples += 1;
            healthySamples = 0;
          } else {
            blackSamples = 0;
            healthySamples += 1;
          }
        } catch {
          blackSamples += 1;
          healthySamples = 0;
        }
      }

      if (blackSamples >= FALLBACK_BAD_SAMPLE_COUNT) {
        setFallbackActive(true);
      } else if (healthySamples >= FALLBACK_HEALTHY_SAMPLE_COUNT) {
        setFallbackActive(false);
      }
    }, 750);

    return () => {
      window.clearInterval(interval);
      setFallbackActive(false);
    };
  }, [status]);

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
  const directShareUrl = useMemo(() => {
    const nextSearch = new URLSearchParams(location.search);
    nextSearch.set("session", sessionId);
    nextSearch.set("role", "spectator");
    return `${window.location.origin}${location.pathname}?${nextSearch.toString()}`;
  }, [location.pathname, location.search, sessionId]);
  const shareInvite = useMemo(() => {
    const companionUrl = shareContext.companionUrls[0];
    if (shareContext.exposureMode !== "lan" || !companionUrl) {
      return {
        guidance: null,
        text: directShareUrl,
        url: directShareUrl,
      };
    }

    let url: URL;
    try {
      const companionOrigin = new URL(companionUrl);
      if (companionOrigin.protocol !== "https:") {
        throw new Error("LAN companion URL must use HTTPS.");
      }
      url = new URL(directShareUrl);
      url.protocol = companionOrigin.protocol;
      url.host = companionOrigin.host;
    } catch {
      return {
        guidance: null,
        text: directShareUrl,
        url: directShareUrl,
      };
    }

    const guidance =
      "Open this HTTPS join link, then enter the short-lived invite code shown in the host's Pixelated Desktop app.";

    return {
      guidance,
      text: `${url.toString()}\n\n${guidance}`,
      url: url.toString(),
    };
  }, [directShareUrl, shareContext]);

  return (
    <div className="flex flex-col items-center pt-24 pb-24 px-4 min-h-screen">
      <PlayerHeader
        backRoute={backRoute}
        backText={backText}
        gameRights={gameRights}
        gameTitle={gameTitle}
        hideGameChrome
        onToggleTelemetry={() =>
          setShowStreamTelemetry((isVisible) => !isVisible)
        }
        showStreamTelemetry={showStreamTelemetry}
        status={status}
      />

      <div
        className={`grid w-full gap-4 transition-[max-width,grid-template-columns] duration-300 ${
          showStreamTelemetry
            ? "max-w-7xl xl:grid-cols-[minmax(0,1fr)_18rem]"
            : "max-w-5xl"
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

      <div className="mt-3 flex w-full max-w-5xl">
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
