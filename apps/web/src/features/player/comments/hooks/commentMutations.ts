import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../../../lib/api/apiClient";
import { invalidateGameCommentsQuery } from "../../../../lib/api/queryClient";

export function usePostCommentMutation(
  gameId: string | undefined,
  {
    onError,
    onSuccess,
  }: {
    onError?: (error: unknown) => void;
    onSuccess?: () => void;
  } = {},
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (content: string) => api.postComment(gameId!, content),
    onError,
    onSuccess: async () => {
      onSuccess?.();
      await invalidateGameCommentsQuery(queryClient, gameId);
    },
  });
}

export function useDeleteCommentMutation(
  gameId: string | undefined,
  { onError }: { onError?: (error: unknown) => void } = {},
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (commentId: string) => api.deleteComment(commentId),
    onError,
    onSuccess: async () => {
      await invalidateGameCommentsQuery(queryClient, gameId);
    },
  });
}

export function useSetCommentReactionMutation(
  gameId: string | undefined,
  { onError }: { onError?: (error: unknown) => void } = {},
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      commentId,
      isLike,
    }: {
      commentId: string;
      isLike: boolean | null;
    }) => api.setCommentReaction(commentId, isLike),
    onError,
    onSuccess: async () => {
      await invalidateGameCommentsQuery(queryClient, gameId);
    },
  });
}

export function useReportCommentMutation({
  onError,
  onSuccess,
}: {
  onError?: (error: unknown) => void;
  onSuccess?: () => void;
} = {}) {
  return useMutation({
    mutationFn: ({
      commentId,
      reason,
    }: {
      commentId: string;
      reason: string;
    }) => api.reportComment(commentId, reason),
    onError,
    onSuccess,
  });
}
