import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { api } from "../../../lib/api/apiClient";
import { getSocialErrorMessage } from "../socialFeedback";

export function useGameReactions(gameId: string | undefined, currentUser: User | null) {
  const [likes, setLikes] = useState(0);
  const [dislikes, setDislikes] = useState(0);
  const [userReaction, setUserReaction] = useState<boolean | null>(null);
  const [isReactionLoading, setIsReactionLoading] = useState(false);
  const [reactionError, setReactionError] = useState("");
  const [loadedGameId, setLoadedGameId] = useState<string | undefined>();
  const activeGameIdRef = useRef(gameId);
  const reactionPendingRef = useRef(false);

  activeGameIdRef.current = gameId;

  const fetchReactions = useCallback(async () => {
    if (!gameId) return;

    try {
      const { reactions } = await api.gameReactions(gameId);
      if (activeGameIdRef.current !== gameId) return;

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
      setLoadedGameId(gameId);
      setReactionError("");
    } catch (error) {
      if (activeGameIdRef.current === gameId) {
        setReactionError(
          getSocialErrorMessage(error, "Could not load reactions. Try again."),
        );
      }
    }
  }, [gameId, currentUser]);

  useEffect(() => {
    fetchReactions();
  }, [fetchReactions]);

  const handleReaction = async (isLike: boolean) => {
    if (!currentUser) {
      setReactionError("Sign in to react to this game.");
      return;
    }
    if (!gameId) return;
    if (reactionPendingRef.current) return;
    reactionPendingRef.current = true;
    setIsReactionLoading(true);
    setReactionError("");

    try {
      if (userReaction === isLike) {
        await api.setGameReaction(gameId, null);
      } else {
        await api.setGameReaction(gameId, isLike);
      }
      await fetchReactions();
    } catch (err) {
      console.error(err);
      setReactionError(
        getSocialErrorMessage(err, "Failed to update reaction. Try again."),
      );
    } finally {
      reactionPendingRef.current = false;
      setIsReactionLoading(false);
    }
  };

  return {
    dislikes: loadedGameId === gameId ? dislikes : 0,
    handleReaction,
    isReactionLoading,
    likes: loadedGameId === gameId ? likes : 0,
    reactionError,
    retryReactions: () => void fetchReactions(),
    userReaction: loadedGameId === gameId ? userReaction : null,
  };
}
