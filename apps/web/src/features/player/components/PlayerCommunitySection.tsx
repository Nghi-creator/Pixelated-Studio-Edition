import { CommentsPanel } from "../comments/components/CommentsPanel";
import { ReportModal } from "../comments/components/ReportModal";
import { useCommentReporting } from "../comments/hooks/useCommentReporting";
import { useComments } from "../comments/hooks/useComments";
import { useAuthUser } from "../hooks/useAuthUser";
import { useGameReactions } from "../hooks/useGameReactions";
import { ReactionButtons } from "./ReactionButtons";

export function PlayerCommunitySection({
  currentUser,
  gameId,
  layoutClassName,
  onSignIn,
}: {
  currentUser: ReturnType<typeof useAuthUser>;
  gameId?: string;
  layoutClassName: string;
  onSignIn: () => void;
}) {
  const {
    dislikes,
    handleReaction,
    isReactionLoading,
    likes,
    reactionError,
    retryReactions,
    userReaction,
  } = useGameReactions(gameId, currentUser);
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
  } = useComments(gameId, currentUser);
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

  return (
    <>
      <CommentsPanel
        comments={comments}
        commentsError={commentsError}
        currentUser={currentUser}
        hasMoreComments={hasMoreComments}
        isLoadingComments={isLoadingComments}
        isLoadingMoreComments={isLoadingMoreComments}
        isSubmittingComment={isSubmittingComment}
        layoutClassName={layoutClassName}
        newComment={newComment}
        onCommentReaction={handleCommentReaction}
        onDeleteComment={handleDeleteComment}
        onLoadMore={loadMoreComments}
        onPostComment={handlePostComment}
        onReportComment={openReportModal}
        onRetryComments={retryComments}
        onSignIn={onSignIn}
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
    </>
  );
}
