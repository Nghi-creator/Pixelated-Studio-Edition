import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api/apiClient";
import type {
  ApiAdminReportAction,
  ApiAdminReportActionResponse,
  ApiCatalogCandidateReviewAction,
  ApiCatalogCandidateReviewResponse,
  ApiCatalogCandidateSourceKind,
  ApiCatalogCandidateStatus,
  ApiGameSubmissionReviewResponse,
  ApiGameSubmissionStatus,
  ApiPaginatedCatalogCandidatesResponse,
  ApiPaginatedGameSubmissionsResponse,
  ApiPaginatedReportsResponse,
  ApiPaginatedUsersResponse,
  ApiProfile,
  ApiSubmissionCandidatePayload,
} from "../../lib/api/apiTypes";
import {
  invalidateAdminReportsQueries,
  invalidateAdminUsersQueries,
  invalidateCatalogCandidateQueries,
  invalidateGameSubmissionQueries,
  queryKeys,
} from "../../lib/api/queryClient";

type AdminReportCacheItem = {
  comments?: { id: string | null } | null;
  id: string;
};

type AdminUserCacheItem = {
  id: string;
};

type CatalogCandidateCacheItem = {
  id: string;
};

type GameSubmissionCacheItem = {
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

export function useReviewCatalogCandidateMutation<
  TCandidate extends CatalogCandidateCacheItem,
>({
  onError,
  onReviewed,
  page,
  pageSize,
  platformId,
  search,
  sourceKind,
  status,
  totalCandidates,
}: {
  onError?: (error: unknown) => void;
  onReviewed?: ({
    nextTotal,
    result,
  }: {
    nextTotal: number;
    result: ApiCatalogCandidateReviewResponse<TCandidate>;
  }) => void;
  page: number;
  pageSize: number;
  platformId: string;
  search: string;
  sourceKind: ApiCatalogCandidateSourceKind | "";
  status: ApiCatalogCandidateStatus;
  totalCandidates: number;
}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      action,
      candidateId,
      notes,
    }: {
      action: ApiCatalogCandidateReviewAction;
      candidateId: string;
      notes: string;
    }) => api.reviewCatalogCandidate<TCandidate>(candidateId, action, notes),
    onError,
    onSuccess: async (result, { candidateId }) => {
      const nextTotal = Math.max(0, totalCandidates - 1);

      queryClient.setQueryData(
        queryKeys.catalogCandidates(
          page,
          pageSize,
          status,
          sourceKind,
          platformId,
          search,
        ),
        (
          current:
            | ApiPaginatedCatalogCandidatesResponse<TCandidate>
            | undefined,
        ) =>
          current
            ? {
                ...current,
                candidates: current.candidates.filter(
                  (candidate) => candidate.id !== candidateId,
                ),
                total: nextTotal,
              }
            : current,
      );

      onReviewed?.({ nextTotal, result });
      await invalidateCatalogCandidateQueries(queryClient);
    },
  });
}

export function useReviewGameSubmissionMutation<
  TSubmission extends GameSubmissionCacheItem,
>({
  onError,
  onReviewed,
  page,
  pageSize,
  search,
  status,
  totalSubmissions,
}: {
  onError?: (error: unknown) => void;
  onReviewed?: ({
    nextTotal,
    result,
  }: {
    nextTotal: number;
    result: ApiGameSubmissionReviewResponse<TSubmission>;
  }) => void;
  page: number;
  pageSize: number;
  search: string;
  status: ApiGameSubmissionStatus;
  totalSubmissions: number;
}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      notes,
      payload,
      submissionId,
    }: {
      notes?: string;
      payload?: ApiSubmissionCandidatePayload;
      submissionId: string;
    }) =>
      payload
        ? api.createSubmissionCandidate<TSubmission>(submissionId, payload)
        : api.rejectGameSubmission<TSubmission>(submissionId, notes || ""),
    onError,
    onSuccess: async (result, { payload, submissionId }) => {
      const nextTotal = Math.max(0, totalSubmissions - 1);

      queryClient.setQueryData(
        queryKeys.gameSubmissions(page, pageSize, status, search),
        (
          current:
            | ApiPaginatedGameSubmissionsResponse<TSubmission>
            | undefined,
        ) =>
          current
            ? {
                ...current,
                submissions: current.submissions.filter(
                  (submission) => submission.id !== submissionId,
                ),
                total: nextTotal,
              }
            : current,
      );

      onReviewed?.({ nextTotal, result });
      await Promise.all([
        invalidateGameSubmissionQueries(queryClient),
        payload ? invalidateCatalogCandidateQueries(queryClient) : Promise.resolve(),
      ]);
    },
  });
}
