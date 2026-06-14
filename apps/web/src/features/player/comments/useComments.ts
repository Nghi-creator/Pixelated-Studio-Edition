import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { api } from "../../../lib/apiClient";
import type { GameComment } from "../types";
import { getSocialErrorMessage } from "../socialFeedback";
import { mergeCommentPage } from "./commentPages";

export function useComments(gameId: string | undefined, currentUser: User | null) {
  const [comments, setComments] = useState<GameComment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [isLoadingComments, setIsLoadingComments] = useState(true);
  const [isLoadingMoreComments, setIsLoadingMoreComments] = useState(false);
  const [commentsError, setCommentsError] = useState("");
  const [pendingCommentIds, setPendingCommentIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [page, setPage] = useState(0);
  const [hasMoreComments, setHasMoreComments] = useState(true);
  const [loadedGameId, setLoadedGameId] = useState<string | undefined>();
  const activeGameIdRef = useRef(gameId);
  const loadingPagesRef = useRef(new Set<string>());
  const pendingCommentIdsRef = useRef(new Set<string>());
  const postingCommentRef = useRef(false);

  activeGameIdRef.current = gameId;

  const fetchComments = useCallback(
    async (pageNum: number, isInitial = false) => {
      if (!gameId) return;
      const pageKey = `${gameId}:${pageNum}`;
      if (loadingPagesRef.current.has(pageKey)) return;

      loadingPagesRef.current.add(pageKey);
      setCommentsError("");
      if (isInitial) setIsLoadingComments(true);
      else setIsLoadingMoreComments(true);

      try {
        const data = await api.gameComments<GameComment>(gameId, pageNum);
        if (activeGameIdRef.current !== gameId) return;

        setHasMoreComments(data.hasMore);
        setLoadedGameId(gameId);
        setPage(pageNum);
        setComments((current) =>
          mergeCommentPage(current, data.comments, isInitial),
        );
      } catch (error) {
        if (activeGameIdRef.current === gameId) {
          setCommentsError(
            getSocialErrorMessage(error, "Could not load comments. Try again."),
          );
        }
      } finally {
        loadingPagesRef.current.delete(pageKey);
        if (activeGameIdRef.current === gameId) {
          if (isInitial) setIsLoadingComments(false);
          else setIsLoadingMoreComments(false);
        }
      }
    },
    [gameId],
  );

  useEffect(() => {
    loadingPagesRef.current.clear();
    void fetchComments(0, true);
  }, [fetchComments]);

  const handlePostComment = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!currentUser || !newComment.trim() || !gameId) return;
    if (postingCommentRef.current) return;

    postingCommentRef.current = true;
    setIsSubmittingComment(true);
    try {
      await api.postComment(gameId, newComment.trim());
      setNewComment("");
      await fetchComments(0, true);
    } catch (err) {
      console.error(err);
      setCommentsError(
        getSocialErrorMessage(err, "Failed to post comment. Try again."),
      );
    } finally {
      postingCommentRef.current = false;
      setIsSubmittingComment(false);
    }
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
      await api.deleteComment(commentId);
      setComments((prev) => prev.filter((comment) => comment.id !== commentId));
    } catch (err) {
      console.error(err);
      setCommentsError(
        getSocialErrorMessage(err, "Failed to delete comment. Try again."),
      );
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

      const data = await api.setCommentReaction(
        commentId,
        existingReaction?.is_like === isLike ? null : isLike,
      );
      setComments((prev) =>
        prev.map((comment) =>
          comment.id === commentId
            ? { ...comment, comment_likes: data.reactions }
            : comment,
        ),
      );
    } catch (err) {
      console.error(err);
      setCommentsError(
        getSocialErrorMessage(err, "Failed to update reaction. Try again."),
      );
    } finally {
      pendingCommentIdsRef.current.delete(commentId);
      setPendingCommentIds(new Set(pendingCommentIdsRef.current));
    }
  };

  const loadMoreComments = () => {
    if (isLoadingMoreComments || !hasMoreComments) return;
    void fetchComments(page + 1, false);
  };

  return {
    comments: loadedGameId === gameId ? comments : [],
    handleCommentReaction,
    handleDeleteComment,
    handlePostComment,
    hasMoreComments,
    commentsError,
    isLoadingComments: isLoadingComments || loadedGameId !== gameId,
    isLoadingMoreComments,
    isSubmittingComment,
    loadMoreComments,
    newComment,
    pendingCommentIds,
    retryComments: () => void fetchComments(0, true),
    setNewComment,
  };
}
