import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../../../lib/supabaseClient";
import type { GameComment } from "../types";

export function useComments(gameId: string | undefined, currentUser: User | null) {
  const [comments, setComments] = useState<GameComment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMoreComments, setHasMoreComments] = useState(true);

  const fetchComments = useCallback(
    async (pageNum: number, isInitial = false) => {
      if (!gameId) return;

      const { data, error } = await supabase
        .from("comments")
        .select(
          `
          id, content, created_at, user_id,
          profiles ( username, avatar_url ),
          comment_likes ( user_id, is_like )
        `,
        )
        .eq("game_id", gameId)
        .order("created_at", { ascending: false })
        .range(pageNum * 10, (pageNum + 1) * 10);

      if (error) return console.error(error);

      let displayData = data;

      if (data.length > 10) {
        setHasMoreComments(true);
        displayData = data.slice(0, 10);
      } else {
        setHasMoreComments(false);
      }

      const typedData = displayData as unknown as GameComment[];

      if (isInitial) {
        setComments(typedData);
      } else {
        setComments((prev) => [...prev, ...typedData]);
      }
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
      const { error } = await supabase.from("comments").insert({
        user_id: currentUser.id,
        game_id: gameId,
        content: newComment.trim(),
      });
      if (error) throw error;
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
      await supabase.from("comments").delete().eq("id", commentId);
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
        await supabase
          .from("comment_likes")
          .delete()
          .match({ user_id: currentUser.id, comment_id: commentId });
      } else {
        if (existingReaction) {
          await supabase
            .from("comment_likes")
            .delete()
            .match({ user_id: currentUser.id, comment_id: commentId });
        }
        await supabase.from("comment_likes").insert({
          user_id: currentUser.id,
          comment_id: commentId,
          is_like: isLike,
        });
      }

      const { data } = await supabase
        .from("comment_likes")
        .select("user_id, is_like")
        .eq("comment_id", commentId);

      if (data) {
        setComments((prev) =>
          prev.map((comment) =>
            comment.id === commentId
              ? { ...comment, comment_likes: data }
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
