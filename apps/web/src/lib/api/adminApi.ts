import type {
  ApiAdminReportAction,
  ApiAdminReportActionResponse,
  ApiCatalogCandidateReviewAction,
  ApiCatalogCandidateReviewResponse,
  ApiCatalogCandidateSourceKind,
  ApiCatalogCandidateStatus,
  ApiGameSubmissionReviewResponse,
  ApiGameSubmissionStatus,
  ApiPaginatedGameSubmissionsResponse,
  ApiPaginatedCatalogCandidatesResponse,
  ApiPaginatedAccessLogsResponse,
  ApiPaginatedReportsResponse,
  ApiPaginatedUsersResponse,
  ApiSubmissionCandidatePayload,
  ApiProfile,
} from "./apiTypes";

type AdminApiDependencies = {
  apiRequest: <T>(path: string, options?: RequestInit & { authenticated?: boolean; timeoutMs?: number }) => Promise<T>;
};

export function createAdminApi({ apiRequest }: AdminApiDependencies) {
  return {
    accessLogs: <TLog>(page = 1, pageSize = 25) =>
      apiRequest<ApiPaginatedAccessLogsResponse<TLog>>(
        `/admin/access-logs?page=${page}&pageSize=${pageSize}`,
      ),
    adminReports: <TReport>(
      page = 1,
      pageSize = 25,
      targetRole: "all" | "users" | "admins" = "all",
    ) => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        targetRole,
      });

      return apiRequest<ApiPaginatedReportsResponse<TReport>>(
        `/admin/reports?${params}`,
      );
    },
    adminReportAction: (reportId: string, action: ApiAdminReportAction) =>
      apiRequest<ApiAdminReportActionResponse>(
        `/admin/reports/${reportId}/action`,
        {
          body: JSON.stringify({ action }),
          method: "POST",
        },
      ),
    catalogCandidates: <TCandidate>({
      page = 1,
      pageSize = 25,
      platformId = "",
      search = "",
      sourceKind = "",
      status = "needs_review",
    }: {
      page?: number;
      pageSize?: number;
      platformId?: string;
      search?: string;
      sourceKind?: ApiCatalogCandidateSourceKind | "";
      status?: ApiCatalogCandidateStatus;
    } = {}) => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        status,
      });
      if (platformId.trim()) params.set("platformId", platformId.trim());
      if (search.trim()) params.set("search", search.trim());
      if (sourceKind) params.set("sourceKind", sourceKind);

      return apiRequest<ApiPaginatedCatalogCandidatesResponse<TCandidate>>(
        `/admin/catalog-candidates?${params}`,
      );
    },
    reviewCatalogCandidate: <TCandidate>(
      candidateId: string,
      action: ApiCatalogCandidateReviewAction,
      notes: string,
    ) =>
      apiRequest<ApiCatalogCandidateReviewResponse<TCandidate>>(
        `/admin/catalog-candidates/${candidateId}`,
        {
          body: JSON.stringify({ action, notes }),
          method: "PATCH",
        },
      ),
    gameSubmissions: <TSubmission>({
      page = 1,
      pageSize = 25,
      search = "",
      status = "pending",
    }: {
      page?: number;
      pageSize?: number;
      search?: string;
      status?: ApiGameSubmissionStatus;
    } = {}) => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        status,
      });
      if (search.trim()) params.set("search", search.trim());

      return apiRequest<ApiPaginatedGameSubmissionsResponse<TSubmission>>(
        `/admin/submissions?${params}`,
      );
    },
    createSubmissionCandidate: <TSubmission>(
      submissionId: string,
      payload: ApiSubmissionCandidatePayload,
    ) =>
      apiRequest<ApiGameSubmissionReviewResponse<TSubmission>>(
        `/admin/submissions/${submissionId}`,
        {
          body: JSON.stringify({ action: "create_candidate", ...payload }),
          method: "PATCH",
        },
      ),
    rejectGameSubmission: <TSubmission>(submissionId: string, notes: string) =>
      apiRequest<ApiGameSubmissionReviewResponse<TSubmission>>(
        `/admin/submissions/${submissionId}`,
        {
          body: JSON.stringify({ action: "reject", notes }),
          method: "PATCH",
        },
      ),
    updateAdminUser: (
      userId: string,
      patch: Partial<Pick<ApiProfile, "is_banned" | "role">>,
    ) =>
      apiRequest<{ user: ApiProfile }>(`/admin/users/${userId}`, {
        body: JSON.stringify(patch),
        method: "PATCH",
      }),
    users: <TUser = Required<ApiProfile>>({
      page = 1,
      pageSize = 25,
      search = "",
    }: {
      page?: number;
      pageSize?: number;
      search?: string;
    } = {}) => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (search.trim()) params.set("search", search.trim());

      return apiRequest<ApiPaginatedUsersResponse<TUser>>(
        `/admin/users?${params}`,
      );
    },
  };
}
