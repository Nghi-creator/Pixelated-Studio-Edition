import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./apiClient";
import type {
  ApiAdminReportAction,
  ApiAdminReportActionResponse,
  ApiPaginatedReportsResponse,
  ApiPaginatedUsersResponse,
  ApiProfile,
} from "./apiTypes";
import {
  invalidateAdminReportsQueries,
  invalidateAdminUsersQueries,
  invalidateGameCommentsQuery,
  invalidateGameReactionsQuery,
  queryKeys,
} from "./queryClient";

type AdminReportCacheItem = {
  comments?: { id: string | null } | null;
  id: string;
};

type AdminUserCacheItem = {
  id: string;
};

export function useResolveAdminReportMutation<
  TReport extends AdminReportCacheItem,
>({
  onError,
  onResolved,
  page,
  pageSize,
  targetRole,
  totalReports,
}: {
  onError?: (error: unknown) => void;
  onResolved?: ({
    nextTotal,
    result,
  }: {
    nextTotal: number;
    result: ApiAdminReportActionResponse;
  }) => void;
  page: number;
  pageSize: number;
  targetRole: "all" | "users" | "admins";
  totalReports: number;
}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      action,
      reportId,
    }: {
      action: ApiAdminReportAction;
      reportId: string;
    }) => api.adminReportAction(reportId, action),
    onError,
    onSuccess: async (result, { action }) => {
      const nextTotal = Math.max(0, totalReports - 1);

      queryClient.setQueryData(
        queryKeys.adminReports(page, pageSize, targetRole),
        (current: ApiPaginatedReportsResponse<TReport> | undefined) =>
          current
            ? {
                ...current,
                reports:
                  action === "ignore"
                    ? current.reports.filter(
                        (report) => report.id !== result.reportId,
                      )
                    : current.reports.filter(
                        (report) => report.comments?.id !== result.commentId,
                      ),
                total: nextTotal,
              }
            : current,
      );

      onResolved?.({ nextTotal, result });
      await invalidateAdminReportsQueries(queryClient);
    },
  });
}

export function useUpdateAdminUserMutation<TUser extends AdminUserCacheItem>({
  onError,
  onSuccess,
  page,
  pageSize,
  search,
}: {
  onError?: (error: unknown) => void;
  onSuccess?: (user: ApiProfile) => void;
  page: number;
  pageSize: number;
  search: string;
}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<Pick<ApiProfile, "is_banned" | "role">>;
    }) => api.updateAdminUser(id, patch),
    onError,
    onSuccess: async ({ user }) => {
      queryClient.setQueryData(
        queryKeys.adminUsers(page, pageSize, search),
        (current: ApiPaginatedUsersResponse<TUser> | undefined) =>
          current && user.id
            ? {
                ...current,
                users: current.users.map((currentUser) =>
                  currentUser.id === user.id
                    ? { ...currentUser, ...user }
                    : currentUser,
                ),
              }
            : current,
      );

      onSuccess?.(user);
      await invalidateAdminUsersQueries(queryClient);
    },
  });
}

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

export function useCountPlayMutation({
  onError,
  onSuccess,
}: {
  onError?: (error: unknown) => void;
  onSuccess?: () => void;
} = {}) {
  return useMutation({
    mutationFn: (gameId: string) => api.countPlay(gameId),
    onError,
    onSuccess,
  });
}
