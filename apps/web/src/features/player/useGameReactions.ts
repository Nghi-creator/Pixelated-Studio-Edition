import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { api } from "../../lib/apiClient";

export function useGameReactions(gameId: string | undefined, currentUser: User | null) {
  const [likes, setLikes] = useState(0);
  const [dislikes, setDislikes] = useState(0);
  const [userReaction, setUserReaction] = useState<boolean | null>(null);
  const [isReactionLoading, setIsReactionLoading] = useState(false);

  const fetchReactions = useCallback(async () => {
    if (!gameId) return;

    const { reactions } = await api.gameReactions(gameId);

    let likeCount = 0;
    let dislikeCount = 0;
    let currentUserReaction: boolean | null = null;

    reactions.forEach((row) => {
      if (row.is_like) likeCount++;
      else dislikeCount++;

      if (currentUser && row.user_id === currentUser.id) {
        currentUserReaction = row.is_like;
      }
    });

    setLikes(likeCount);
    setDislikes(dislikeCount);
    setUserReaction(currentUserReaction);
  }, [gameId, currentUser]);

  useEffect(() => {
    fetchReactions();
  }, [fetchReactions]);

  const handleReaction = async (isLike: boolean) => {
    if (!currentUser) {
      alert("Please sign in to react to this game!");
      return;
    }
    if (!gameId) return;
    if (isReactionLoading) return;
    setIsReactionLoading(true);

    try {
      if (userReaction === isLike) {
        await api.setGameReaction(gameId, null);
      } else {
        await api.setGameReaction(gameId, isLike);
      }
      await fetchReactions();
    } catch (err) {
      console.error(err);
    } finally {
      setIsReactionLoading(false);
    }
  };

  return {
    dislikes,
    handleReaction,
    likes,
    userReaction,
  };
}
