import type { User } from "@supabase/supabase-js";
import type { GameComment } from "../types";
import { CommentForm } from "./CommentForm";
import { CommentItem } from "./CommentItem";

type CommentsPanelProps = {
  comments: GameComment[];
  currentUser: User | null;
  hasMoreComments: boolean;
  isSubmittingComment: boolean;
  newComment: string;
  onCommentReaction: (commentId: string, isLike: boolean) => void;
  onDeleteComment: (commentId: string) => void;
  onLoadMore: () => void;
  onPostComment: (event: React.FormEvent<HTMLFormElement>) => void;
  onReportComment: (commentId: string) => void;
  onSignIn: () => void;
  reactionButtons: React.ReactNode;
  setNewComment: (comment: string) => void;
};

export function CommentsPanel({
  comments,
  currentUser,
  hasMoreComments,
  isSubmittingComment,
  newComment,
  onCommentReaction,
  onDeleteComment,
  onLoadMore,
  onPostComment,
  onReportComment,
  onSignIn,
  reactionButtons,
  setNewComment,
}: CommentsPanelProps) {
  return (
    <div className="w-full max-w-5xl mt-12 border-t border-synth-border pt-8">
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

      <div className="space-y-6">
        {comments.length === 0 ? (
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
            />
          ))
        )}
      </div>

      {hasMoreComments && comments.length > 0 && (
        <button
          onClick={onLoadMore}
          className="mt-8 w-full py-3 border border-synth-border rounded-xl text-gray-400 hover:text-white hover:bg-synth-elevated transition-all font-medium"
        >
          Load More Comments
        </button>
      )}
    </div>
  );
}
