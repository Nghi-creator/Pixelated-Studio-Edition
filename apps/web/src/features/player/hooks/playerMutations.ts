import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../../lib/api/apiClient";
import { invalidateGameReactionsQuery } from "../../../lib/api/queryClient";

export function useSetGameReactionMutation(
  gameId: string | undefined,
  { onError }: { onError?: (error: unknown) => void } = {},
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (isLike: boolean | null) => api.setGameReaction(gameId!, isLike),
    onError,
    onSuccess: async () => {
      await invalidateGameReactionsQuery(queryClient, gameId);
    },
  });
}

export function useCountPlayMutation({
  onError,
  onSuccess,
}: {
  onError?: (error: unknown) => void;
  onSuccess?: () => void;
} = {}) {
  return useMutation({
    mutationFn: ({ gameId, playEventId }: { gameId: string; playEventId: string }) =>
      api.countPlay(gameId, playEventId),
    onError,
    onSuccess,
  });
}
