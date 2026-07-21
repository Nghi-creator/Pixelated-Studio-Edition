import { useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { useSetGameReactionMutation } from "./playerMutations";
import { useGameReactionsQuery } from "../../../lib/api/apiQueries";
import { getSocialErrorMessage } from "../socialFeedback";

export function useGameReactions(gameId: string | undefined, currentUser: User | null) {
  const [localReactionError, setLocalReactionError] = useState("");

  const reactionsQuery = useGameReactionsQuery(gameId);
  const reactionSummary = useMemo(() => {
    let likeCount = 0;
    let dislikeCount = 0;
    let currentUserReaction: boolean | null = null;

    reactionsQuery.data?.reactions.forEach((row) => {
      if (row.is_like) likeCount++;
      else dislikeCount++;

      if (currentUser && row.user_id === currentUser.id) {
        currentUserReaction = row.is_like;
      }
    });

    return { dislikeCount, likeCount, userReaction: currentUserReaction };
  }, [currentUser, reactionsQuery.data]);

  const reactionMutation = useSetGameReactionMutation(gameId, {
    onError: (err) => {
      console.error(err);
      setLocalReactionError(
        getSocialErrorMessage(err, "Failed to update reaction. Try again."),
      );
    },
  });

  const queryReactionError = reactionsQuery.isError
    ? getSocialErrorMessage(
        reactionsQuery.error,
        "Could not load reactions. Try again.",
      )
    : "";

  const handleReaction = async (isLike: boolean) => {
    if (!currentUser) {
      setLocalReactionError("Sign in to react to this game.");
      return;
    }
    if (!gameId) return;
    setLocalReactionError("");

    await reactionMutation.mutateAsync(
      reactionSummary.userReaction === isLike ? null : isLike,
    );
  };

  return {
    dislikes: gameId ? reactionSummary.dislikeCount : 0,
    handleReaction,
    isReactionLoading: reactionsQuery.isLoading || reactionMutation.isPending,
    likes: gameId ? reactionSummary.likeCount : 0,
    reactionError: localReactionError || queryReactionError,
    retryReactions: () => {
      setLocalReactionError("");
      void reactionsQuery.refetch();
    },
    userReaction: gameId ? reactionSummary.userReaction : null,
  };
}
