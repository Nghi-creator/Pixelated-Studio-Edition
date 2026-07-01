import type {
  ApiAdminReportAction,
  ApiAdminReportActionResponse,
  ApiPaginatedAccessLogsResponse,
  ApiPaginatedReportsResponse,
  ApiPaginatedUsersResponse,
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
