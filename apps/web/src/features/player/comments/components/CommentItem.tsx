import { Flag, ThumbsDown, ThumbsUp, Trash2 } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import type { GameComment } from "../../types";
import { Avatar } from "../../../../components/ui/Avatar";

type CommentItemProps = {
  comment: GameComment;
  currentUser: User | null;
  onCommentReaction: (commentId: string, isLike: boolean) => void;
  onDeleteComment: (commentId: string) => void;
  onReportComment: (commentId: string) => void;
  pending: boolean;
};

export function CommentItem({
  comment,
  currentUser,
  onCommentReaction,
  onDeleteComment,
  onReportComment,
  pending,
}: CommentItemProps) {
  const displayName = comment.profiles?.username || "Anonymous Player";

  let commentLikes = 0;
  let commentDislikes = 0;
  let currentUserReaction: boolean | null = null;

  comment.comment_likes?.forEach((reaction) => {
    if (reaction.is_like) commentLikes++;
    else commentDislikes++;
    if (currentUser && reaction.user_id === currentUser.id) {
      currentUserReaction = reaction.is_like;
    }
  });

  return (
    <div className="flex gap-4 group">
      <Avatar
        alt="Avatar"
        name={displayName}
        src={comment.profiles?.avatar_url}
      />
      <div className="flex-grow">
        <div className="flex justify-between items-start mb-1">
          <div className="flex items-center gap-2">
            <span className="font-bold text-white text-sm">{displayName}</span>
            <span className="text-xs text-gray-500">
              {new Date(comment.created_at).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </span>
          </div>

          <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
            {currentUser?.id === comment.user_id ? (
              <button
                onClick={() => onDeleteComment(comment.id)}
                disabled={pending}
                className="text-gray-500 hover:text-red-400 transition-colors disabled:cursor-wait disabled:opacity-50"
                title="Delete Comment"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            ) : (
              currentUser && (
                <button
                  onClick={() => onReportComment(comment.id)}
                  disabled={pending}
                  className="text-gray-500 hover:text-synth-secondary transition-colors disabled:cursor-wait disabled:opacity-50"
                  title="Report Comment"
                >
                  <Flag className="w-4 h-4" />
                </button>
              )
            )}
          </div>
        </div>

        <p className="text-gray-300 text-sm leading-relaxed mb-3">
          {comment.content}
        </p>

        <div className="flex items-center gap-3">
          <button
            onClick={() => onCommentReaction(comment.id, true)}
            disabled={currentUser?.id === comment.user_id || pending}
            className={`flex items-center gap-1.5 text-xs font-medium transition-all ${
              currentUser?.id === comment.user_id
                ? "text-gray-600 opacity-50 cursor-not-allowed"
                : currentUserReaction === true
                  ? "text-synth-primary"
                  : "text-gray-500 hover:text-white"
            }`}
          >
            <ThumbsUp
              className={`w-3.5 h-3.5 ${currentUserReaction === true ? "fill-current" : ""}`}
            />
            {commentLikes > 0 && commentLikes}
          </button>

          <button
            onClick={() => onCommentReaction(comment.id, false)}
            disabled={currentUser?.id === comment.user_id || pending}
            className={`flex items-center gap-1.5 text-xs font-medium transition-all ${
              currentUser?.id === comment.user_id
                ? "text-gray-600 opacity-50 cursor-not-allowed"
                : currentUserReaction === false
                  ? "text-red-400"
                  : "text-gray-500 hover:text-white"
            }`}
          >
            <ThumbsDown
              className={`w-3.5 h-3.5 ${currentUserReaction === false ? "fill-current" : ""}`}
            />
            {commentDislikes > 0 && commentDislikes}
          </button>
        </div>
      </div>
    </div>
  );
}
