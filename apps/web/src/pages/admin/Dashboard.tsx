import { useState } from "react";
import { Check, Filter } from "lucide-react";
import ReportCard, { type Report } from "../../components/admin/ReportCard";
import {
  AdminConfirmDialog,
  type AdminConfirmation,
} from "../../components/admin/AdminConfirmDialog";
import type { ApiAdminReportAction } from "../../lib/api/apiClient";
import { useResolveAdminReportMutation } from "../../features/admin/adminMutations";
import {
  useAdminReportsQuery,
  useAuthSessionQuery,
  usePermissionsQuery,
} from "../../lib/api/apiQueries";
import { ModerationQueueSkeleton } from "../../components/ui/Skeleton";
import { Pagination } from "../../components/ui/Pagination";
import { PixelIcon } from "../../components/ui/PixelIcon";
import {
  getAdminApiErrorMessage,
  getPageAfterRemoval,
  getPageRangeLabel,
  type AdminTargetRoleFilter,
} from "../../features/admin/adminState";

const REPORTS_PER_PAGE = 25;

type FilterType = AdminTargetRoleFilter;

export default function Dashboard() {
  const [filter, setFilter] = useState<FilterType>("all");
  const [page, setPage] = useState(1);
  const [actionError, setActionError] = useState("");
  const [pendingReportId, setPendingReportId] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<
    (AdminConfirmation & { action: ApiAdminReportAction }) | null
  >(null);

  const sessionQuery = useAuthSessionQuery();
  const permissionsQuery = usePermissionsQuery({
    enabled: Boolean(sessionQuery.data?.user),
  });
  const currentUserRole = permissionsQuery.data?.profile.role || "";
  const canModerate =
    currentUserRole === "admin" || currentUserRole === "super_admin";
  const currentUserId = sessionQuery.data?.user?.id || "";
  const reportsQuery = useAdminReportsQuery<Report>(
    page,
    REPORTS_PER_PAGE,
    filter,
    { enabled: canModerate },
  );
  const reportsData = canModerate ? reportsQuery.data : undefined;
  const reportsLoading = canModerate && reportsQuery.isLoading;
  const reportsError = canModerate && reportsQuery.isError;
  const reports = reportsData?.reports || [];
  const totalReports = reportsData?.total || reports.length;
  const totalPages = reportsData?.totalPages || 1;
  const safePage = Math.min(page, totalPages);

  const resolveReportMutation = useResolveAdminReportMutation<Report>({
    page,
    pageSize: REPORTS_PER_PAGE,
    targetRole: filter,
    totalReports,
    onError: (err) => {
      console.error("Failed to resolve report:", err);
      setActionError(
        getAdminApiErrorMessage(
          err,
          "Failed to resolve report. Please try again.",
        ),
      );
    },
    onResolved: ({ nextTotal }) => {
      setPage(
        getPageAfterRemoval({
          currentPage: page,
          pageSize: REPORTS_PER_PAGE,
          totalAfterRemoval: nextTotal,
        }),
      );
    },
  });

  const resolveReport = async (
    reportId: string,
    action: ApiAdminReportAction,
  ) => {
    if (pendingReportId) return;
    setPendingReportId(reportId);
    setActionError("");
    await resolveReportMutation
      .mutateAsync({ action, reportId })
      .catch(() => undefined)
      .finally(() => setPendingReportId(null));
  };

  const handleIgnore = async (reportId: string) => {
    await resolveReport(reportId, "ignore");
  };

  const handleDeleteComment = async (reportId: string) => {
    await resolveReport(reportId, "delete_comment");
  };

  const handleBanUser = async (reportId: string) => {
    setConfirmation({
      action: "ban_user",
      body: "This permanently bans the reported user and deletes the reported comment. Continue only if the report clearly warrants removal.",
      confirmLabel: "Ban User",
      id: reportId,
      intent: "danger",
      title: "Ban reported user?",
    });
  };

  const handleConfirmAction = async () => {
    if (!confirmation) return;
    const { action, id } = confirmation;
    setConfirmation(null);
    await resolveReport(id, action);
  };

  const loading =
    sessionQuery.isLoading ||
    permissionsQuery.isLoading ||
    reportsLoading;
  const loadError = permissionsQuery.isError
    ? "Could not verify moderation permissions. Try again."
    : reportsError
      ? "Could not load reports. Try again."
      : "";

  if (loading) {
    return <ModerationQueueSkeleton />;
  }

  const pageLabel = getPageRangeLabel({
    currentCount: reports.length,
    page: safePage,
    pageSize: REPORTS_PER_PAGE,
    total: totalReports,
  });

  return (
    <div className="space-y-6">
      {confirmation && (
        <AdminConfirmDialog
          confirmation={confirmation}
          isPending={pendingReportId === confirmation.id}
          onCancel={() => setConfirmation(null)}
          onConfirm={() => void handleConfirmAction()}
        />
      )}
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-3xl font-bold text-white flex items-center gap-3">
          <PixelIcon className="text-synth-secondary w-8 h-8" name="moderation" />
          Moderation Queue
        </h1>

        <div className="flex items-center gap-3">
          {/* Filter Dropdown */}
          <div className="relative flex items-center bg-synth-surface border border-synth-border rounded-lg px-3 py-2 shadow-inner">
            <Filter className="w-4 h-4 text-gray-400 mr-2" />
            <select
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value as FilterType);
                setPage(1);
              }}
              className="bg-transparent text-sm text-gray-300 font-medium focus:outline-none cursor-pointer appearance-none pr-4"
            >
              <option value="all">All Reports</option>
              <option value="users">User Reports</option>
              <option value="admins">Admin Reports</option>
            </select>
          </div>

          <span className="bg-synth-surface text-white border border-synth-border px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap">
            {totalReports} Pending
          </span>
        </div>
      </div>

      {/* Reports Feed */}
      {actionError && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {actionError}
        </div>
      )}

      {loadError ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-8 text-center text-red-200">
          <p>{loadError}</p>
          <button
            className="mt-4 rounded-lg border border-red-400/40 px-4 py-2 text-sm font-bold hover:bg-red-500/10"
            onClick={() => void reportsQuery.refetch()}
            type="button"
          >
            Retry
          </button>
        </div>
      ) : reports.length === 0 ? (
        <div className="bg-[#2B1720] border border-synth-border rounded-lg p-12 text-center text-gray-400 shadow-card">
          <Check className="w-12 h-12 text-[#C02066] mx-auto mb-4 opacity-70" />
          <p className="text-xl">Queue is clear.</p>
          <p className="text-sm mt-2">
            No reports matching this server filter right now.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {reports.map((report) => (
            <ReportCard
              key={report.id}
              report={report}
              currentUserId={currentUserId}
              currentUserRole={currentUserRole}
              onIgnore={handleIgnore}
              onDelete={handleDeleteComment}
              onBan={handleBanUser}
              pending={pendingReportId === report.id}
            />
          ))}
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-gray-500">
          {pageLabel}
          {filter !== "all" && " for this filter"}
        </p>
        <Pagination
          currentPage={safePage}
          disabled={loading}
          onPageChange={setPage}
          totalPages={totalPages}
        />
      </div>
    </div>
  );
}
