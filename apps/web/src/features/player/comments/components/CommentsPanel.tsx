import type { User } from "@supabase/supabase-js";
import type { GameComment } from "../../types";
import { CommentForm } from "./CommentForm";
import { CommentItem } from "./CommentItem";

type CommentsPanelProps = {
  comments: GameComment[];
  commentsError: string;
  currentUser: User | null;
  hasMoreComments: boolean;
  isLoadingComments: boolean;
  isLoadingMoreComments: boolean;
  isSubmittingComment: boolean;
  layoutClassName?: string;
  newComment: string;
  onCommentReaction: (commentId: string, isLike: boolean) => void;
  onDeleteComment: (commentId: string) => void;
  onLoadMore: () => void;
  onPostComment: (event: React.FormEvent<HTMLFormElement>) => void;
  onReportComment: (commentId: string) => void;
  onRetryComments: () => void;
  onSignIn: () => void;
  pendingCommentIds: Set<string>;
  reportMessage: string;
  reactionButtons: React.ReactNode;
  setNewComment: (comment: string) => void;
};

export function CommentsPanel({
  comments,
  commentsError,
  currentUser,
  hasMoreComments,
  isLoadingComments,
  isLoadingMoreComments,
  isSubmittingComment,
  layoutClassName = "max-w-5xl",
  newComment,
  onCommentReaction,
  onDeleteComment,
  onLoadMore,
  onPostComment,
  onReportComment,
  onRetryComments,
  onSignIn,
  pendingCommentIds,
  reportMessage,
  reactionButtons,
  setNewComment,
}: CommentsPanelProps) {
  return (
    <div
      className={`mt-12 w-full border-t border-synth-border pt-8 ${layoutClassName}`}
    >
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-xl font-bold text-white">
          Comments ({comments.length}
          {hasMoreComments ? "+" : ""})
        </h3>
        {reactionButtons}
      </div>

      <CommentForm
        isSubmittingComment={isSubmittingComment}
        newComment={newComment}
        onPostComment={onPostComment}
        onSignIn={onSignIn}
        setNewComment={setNewComment}
        signedIn={Boolean(currentUser)}
      />

      {reportMessage && (
        <div className="mb-6 rounded-lg border border-[#C02066]/40 bg-[#9B0048]/15 px-4 py-3 text-sm text-[#F38BB4]">
          {reportMessage}
        </div>
      )}

      {commentsError && (
        <div className="mb-6 flex items-center justify-between gap-4 rounded-lg border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          <span>{commentsError}</span>
          <button
            className="font-bold text-red-100 hover:text-white"
            onClick={onRetryComments}
            type="button"
          >
            Retry
          </button>
        </div>
      )}

      <div className="space-y-6">
        {isLoadingComments && comments.length === 0 ? (
          <p className="py-8 text-center text-gray-500">Loading comments...</p>
        ) : comments.length === 0 ? (
          <p className="text-gray-500 text-center py-8">
            No comments yet. Be the first to start the discussion!
          </p>
        ) : (
          comments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              currentUser={currentUser}
              onCommentReaction={onCommentReaction}
              onDeleteComment={onDeleteComment}
              onReportComment={onReportComment}
              pending={pendingCommentIds.has(comment.id)}
            />
          ))
        )}
      </div>

      {hasMoreComments && comments.length > 0 && (
        <button
          onClick={onLoadMore}
          disabled={isLoadingMoreComments}
          className="mt-8 w-full py-3 border border-synth-border rounded-xl text-gray-400 hover:text-white hover:bg-synth-elevated transition-all font-medium disabled:cursor-wait disabled:opacity-50"
        >
          {isLoadingMoreComments ? "Loading..." : "Load More Comments"}
        </button>
      )}
    </div>
  );
}
