import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabaseClient";

export function useGameReactions(gameId: string | undefined, currentUser: User | null) {
  const [likes, setLikes] = useState(0);
  const [dislikes, setDislikes] = useState(0);
  const [userReaction, setUserReaction] = useState<boolean | null>(null);
  const [isReactionLoading, setIsReactionLoading] = useState(false);

  const fetchReactions = useCallback(async () => {
    if (!gameId) return;

    const { data, error } = await supabase
      .from("likes")
      .select("user_id, is_like")
      .eq("game_id", gameId);
    if (error) return console.error(error);

    let likeCount = 0;
    let dislikeCount = 0;
    let currentUserReaction: boolean | null = null;

    data.forEach((row) => {
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
    if (isReactionLoading) return;
    setIsReactionLoading(true);

    try {
      if (userReaction === isLike) {
        await supabase
          .from("likes")
          .delete()
          .match({ user_id: currentUser.id, game_id: gameId });
      } else {
        if (userReaction !== null) {
          await supabase
            .from("likes")
            .delete()
            .match({ user_id: currentUser.id, game_id: gameId });
        }
        await supabase
          .from("likes")
          .insert({ user_id: currentUser.id, game_id: gameId, is_like: isLike });
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
