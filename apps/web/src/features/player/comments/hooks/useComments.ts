import { useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import {
  useDeleteCommentMutation,
  usePostCommentMutation,
  useSetCommentReactionMutation,
} from "./commentMutations";
import { useGameCommentsQuery } from "../../../../lib/api/apiQueries";
import type { GameComment } from "../../types";
import { getSocialErrorMessage } from "../../socialFeedback";

export function useComments(gameId: string | undefined, currentUser: User | null) {
  const [newComment, setNewComment] = useState("");
  const [commentsError, setCommentsError] = useState("");
  const [pendingCommentIds, setPendingCommentIds] = useState<Set<string>>(
    () => new Set(),
  );
  const pendingCommentIdsRef = useRef(new Set<string>());

  const commentsQuery = useGameCommentsQuery<GameComment>(gameId);
  const comments =
    commentsQuery.data?.pages.flatMap((page) => page.comments) || [];
  const hasMoreComments = Boolean(commentsQuery.hasNextPage);

  const postCommentMutation = usePostCommentMutation(gameId, {
    onError: (err) => {
      console.error(err);
      setCommentsError(
        getSocialErrorMessage(err, "Failed to post comment. Try again."),
      );
    },
    onSuccess: () => {
      setNewComment("");
    },
  });

  const deleteCommentMutation = useDeleteCommentMutation(gameId, {
    onError: (err) => {
      console.error(err);
      setCommentsError(
        getSocialErrorMessage(err, "Failed to delete comment. Try again."),
      );
    },
  });

  const commentReactionMutation = useSetCommentReactionMutation(gameId, {
    onError: (err) => {
      console.error(err);
      setCommentsError(
        getSocialErrorMessage(err, "Failed to update reaction. Try again."),
      );
    },
  });

  const handlePostComment = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!currentUser || !newComment.trim() || !gameId) return;

    await postCommentMutation.mutateAsync(newComment.trim());
  };

  const handleDeleteComment = async (commentId: string) => {
    if (pendingCommentIdsRef.current.has(commentId)) return;
    if (!window.confirm("Are you sure you want to delete this comment?")) {
      return;
    }

    pendingCommentIdsRef.current.add(commentId);
    setPendingCommentIds(new Set(pendingCommentIdsRef.current));
    setCommentsError("");
    try {
      await deleteCommentMutation.mutateAsync(commentId);
    } finally {
      pendingCommentIdsRef.current.delete(commentId);
      setPendingCommentIds(new Set(pendingCommentIdsRef.current));
    }
  };

  const handleCommentReaction = async (commentId: string, isLike: boolean) => {
    if (!currentUser) {
      setCommentsError("Sign in to react to comments.");
      return;
    }

    const targetComment = comments.find((comment) => comment.id === commentId);
    if (!targetComment || pendingCommentIdsRef.current.has(commentId)) return;

    if (targetComment.user_id === currentUser.id) return;

    pendingCommentIdsRef.current.add(commentId);
    setPendingCommentIds(new Set(pendingCommentIdsRef.current));
    setCommentsError("");
    try {
      const existingReaction = targetComment.comment_likes?.find(
        (reaction) => reaction.user_id === currentUser.id,
      );

      await commentReactionMutation.mutateAsync({
        commentId,
        isLike: existingReaction?.is_like === isLike ? null : isLike,
      });
    } finally {
      pendingCommentIdsRef.current.delete(commentId);
      setPendingCommentIds(new Set(pendingCommentIdsRef.current));
    }
  };

  const loadMoreComments = () => {
    if (commentsQuery.isFetchingNextPage || !hasMoreComments) return;
    void commentsQuery.fetchNextPage();
  };

  return {
    comments: gameId ? comments : [],
    handleCommentReaction,
    handleDeleteComment,
    handlePostComment,
    hasMoreComments,
    commentsError:
      commentsError ||
      (commentsQuery.isError
        ? getSocialErrorMessage(
            commentsQuery.error,
            "Could not load comments. Try again.",
          )
        : ""),
    isLoadingComments: commentsQuery.isLoading,
    isLoadingMoreComments: commentsQuery.isFetchingNextPage,
    isSubmittingComment: postCommentMutation.isPending,
    loadMoreComments,
    newComment,
    pendingCommentIds,
    retryComments: () => void commentsQuery.refetch(),
    setNewComment,
  };
}
