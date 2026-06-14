import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { api } from "../../../lib/apiClient";
import type { GameComment } from "../types";
import { mergeCommentPage } from "./commentPages";

export function useComments(gameId: string | undefined, currentUser: User | null) {
  const [comments, setComments] = useState<GameComment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMoreComments, setHasMoreComments] = useState(true);

  const fetchComments = useCallback(
    async (pageNum: number, isInitial = false) => {
      if (!gameId) return;

      const data = await api.gameComments<GameComment>(gameId, pageNum);
      setHasMoreComments(data.hasMore);

      setComments((current) =>
        mergeCommentPage(current, data.comments, isInitial),
      );
    },
    [gameId],
  );

  useEffect(() => {
    fetchComments(0, true);
  }, [fetchComments]);

  const handlePostComment = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!currentUser || !newComment.trim() || !gameId) return;

    setIsSubmittingComment(true);
    try {
      await api.postComment(gameId, newComment.trim());
      setNewComment("");
      setPage(0);
      await fetchComments(0, true);
    } catch (err) {
      console.error(err);
      alert("Failed to post comment.");
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!window.confirm("Are you sure you want to delete this comment?")) {
      return;
    }

    try {
      await api.deleteComment(commentId);
      setComments((prev) => prev.filter((comment) => comment.id !== commentId));
    } catch (err) {
      console.error(err);
      alert("Failed to delete comment.");
    }
  };

  const handleCommentReaction = async (commentId: string, isLike: boolean) => {
    if (!currentUser) {
      alert("Please sign in to react to comments!");
      return;
    }

    try {
      const targetComment = comments.find((comment) => comment.id === commentId);
      if (!targetComment) return;

      if (targetComment.user_id === currentUser.id) {
        return;
      }

      const existingReaction = targetComment.comment_likes?.find(
        (reaction) => reaction.user_id === currentUser.id,
      );

      if (existingReaction?.is_like === isLike) {
        const data = await api.setCommentReaction(commentId, null);
        setComments((prev) =>
          prev.map((comment) =>
            comment.id === commentId
              ? { ...comment, comment_likes: data.reactions }
              : comment,
          ),
        );
      } else {
        const data = await api.setCommentReaction(commentId, isLike);
        setComments((prev) =>
          prev.map((comment) =>
            comment.id === commentId
              ? { ...comment, comment_likes: data.reactions }
              : comment,
          ),
        );
      }
    } catch (err) {
      console.error(err);
    }
  };

  const loadMoreComments = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchComments(nextPage, false);
  };

  return {
    comments,
    handleCommentReaction,
    handleDeleteComment,
    handlePostComment,
    hasMoreComments,
    isSubmittingComment,
    loadMoreComments,
    newComment,
    setNewComment,
  };
}
