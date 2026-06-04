import { useCallback, useEffect, useState } from "react";
import { Check, LayoutDashboard, Filter } from "lucide-react";
import ReportCard, { type Report } from "../../components/admin/ReportCard";
import {
  api,
  ApiError,
  getAuthSession,
  type ApiAdminReportAction,
} from "../../lib/apiClient";

const REPORTS_PER_PAGE = 25;

type FilterType = "all" | "users" | "admins";

export default function Dashboard() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [currentUserRole, setCurrentUserRole] = useState<string>("");
  const [filter, setFilter] = useState<FilterType>("all");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalReports, setTotalReports] = useState(0);

  useEffect(() => {
    let isMounted = true;

    const fetchCurrentUser = async () => {
      const session = await getAuthSession();
      if (session?.user) {
        if (isMounted) setCurrentUserId(session.user.id);

        const data = await api.permissions();
        if (isMounted) setCurrentUserRole(data.profile.role);
      } else if (isMounted) {
        setLoading(false);
      }
    };

    fetchCurrentUser();

    return () => {
      isMounted = false;
    };
  }, []);

  const fetchReports = useCallback(
    async (isMounted = true) => {
      if (currentUserRole !== "admin" && currentUserRole !== "super_admin") {
        if (currentUserRole) setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const data = await api.adminReports<Report>(page, REPORTS_PER_PAGE);
        if (!isMounted) return;

        setReports(data.reports);
        setTotalReports(data.total);
        setTotalPages(data.totalPages);
        if (page > data.totalPages) {
          setPage(data.totalPages);
        }
      } catch (error) {
        console.error("Error fetching reports:", error);
      } finally {
        if (isMounted) setLoading(false);
      }
    },
    [currentUserRole, page],
  );

  useEffect(() => {
    let isMounted = true;
    fetchReports(isMounted);

    return () => {
      isMounted = false;
    };
  }, [fetchReports]);

  const resolveReport = async (
    reportId: string,
    action: ApiAdminReportAction,
  ) => {
    try {
      const result = await api.adminReportAction(reportId, action);
      setReports((prev) =>
        action === "ignore"
          ? prev.filter((report) => report.id !== result.reportId)
          : prev.filter((report) => report.comments?.id !== result.commentId),
      );
      setTotalReports((currentTotal) => Math.max(0, currentTotal - 1));
    } catch (err) {
      console.error("Failed to resolve report:", err);
      const message =
        err instanceof ApiError && typeof err.payload === "object"
          ? (err.payload as { error?: string })?.error
          : null;
      alert(message || "Failed to resolve report. Please try again.");
    }
  };

  const handleIgnore = async (reportId: string) => {
    await resolveReport(reportId, "ignore");
  };

  const handleDeleteComment = async (reportId: string) => {
    await resolveReport(reportId, "delete_comment");
  };

  const handleBanUser = async (reportId: string) => {
    if (!window.confirm("Are you sure you want to ban this user permanently?"))
      return;

    await resolveReport(reportId, "ban_user");
  };

  // Apply the active filter
  const filteredReports = reports.filter((report) => {
    if (!report.comments) return false;
    const isTargetAdmin = report.comments.profiles.role === "admin";

    if (filter === "users") return !isTargetAdmin;
    if (filter === "admins") return isTargetAdmin;
    return true;
  });

  if (loading) {
    return <div className="text-gray-400">Loading moderation queue...</div>;
  }

  const pageStart = totalReports === 0 ? 0 : (page - 1) * REPORTS_PER_PAGE + 1;
  const pageEnd = Math.min(pageStart + reports.length - 1, totalReports);

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-3xl font-bold text-white flex items-center gap-3">
          <LayoutDashboard className="text-synth-primary w-8 h-8 drop-shadow-[0_0_12px_rgba(255,77,143,0.45)]" />
          Moderation Queue
        </h1>

        <div className="flex items-center gap-3">
          {/* Filter Dropdown */}
          <div className="relative flex items-center bg-synth-surface border border-synth-border rounded-lg px-3 py-2 shadow-inner">
            <Filter className="w-4 h-4 text-gray-400 mr-2" />
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as FilterType)}
              className="bg-transparent text-sm text-gray-300 font-medium focus:outline-none cursor-pointer appearance-none pr-4"
            >
              <option value="all">All Reports</option>
              <option value="users">User Reports</option>
              <option value="admins">Admin Reports</option>
            </select>
          </div>

          <span className="bg-synth-primary/15 text-synth-primary border border-synth-primary/30 px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap">
            {totalReports} Pending
          </span>
        </div>
      </div>

      {/* Reports Feed */}
      {filteredReports.length === 0 ? (
        <div className="bg-synth-surface border border-synth-border rounded-xl p-12 text-center text-gray-400 shadow-glow-card">
          <Check className="w-12 h-12 text-green-500 mx-auto mb-4 opacity-50" />
          <p className="text-xl">Queue is clear.</p>
          <p className="text-sm mt-2">
            No reports matching this filter right now.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredReports.map((report) => (
            <ReportCard
              key={report.id}
              report={report}
              currentUserId={currentUserId}
              currentUserRole={currentUserRole}
              onIgnore={handleIgnore}
              onDelete={handleDeleteComment}
              onBan={handleBanUser}
            />
          ))}
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-gray-500">
          Showing {pageStart}-{pageEnd} of {totalReports}
          {filter !== "all" && " before filter"}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPage((currentPage) => Math.max(1, currentPage - 1))}
            disabled={page === 1 || loading}
            className="h-10 rounded-lg border border-synth-border bg-synth-surface px-4 text-sm font-semibold text-gray-300 transition-colors hover:border-synth-primary/70 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            Previous
          </button>
          <span className="rounded-lg border border-synth-border bg-synth-bg px-4 py-2 text-sm font-semibold text-gray-300">
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() =>
              setPage((currentPage) => Math.min(totalPages, currentPage + 1))
            }
            disabled={page >= totalPages || loading}
            className="h-10 rounded-lg border border-synth-border bg-synth-surface px-4 text-sm font-semibold text-gray-300 transition-colors hover:border-synth-primary/70 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
