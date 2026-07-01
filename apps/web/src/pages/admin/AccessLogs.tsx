import { useState } from "react";
import { ApiError } from "../../lib/api/apiClient";
import { useAccessLogsQuery } from "../../lib/api/apiQueries";
import { AdminTablePageSkeleton } from "../../components/ui/Skeleton";
import { Pagination } from "../../components/ui/Pagination";
import { getPageRangeLabel } from "../../features/admin/adminState";
import { PixelIcon } from "../../components/ui/PixelIcon";

const LOGS_PER_PAGE = 25;

interface AccessLog {
  first_seen_at: string;
  last_seen_at: string;
  sessions_count: number;
  user_id: string | null;
  username: string | null;
}

type AccessLogsErrorPayload = {
  details?: {
    code?: string;
    details?: string;
    hint?: string;
    message?: string;
  };
  error?: string;
};

function getAccessLogsErrorMessage(error: unknown) {
  if (!(error instanceof ApiError) || typeof error.payload !== "object") {
    return "Could not load access logs.";
  }

  const payload = error.payload as AccessLogsErrorPayload | null;
  const baseMessage = payload?.error || "Could not load access logs.";
  const details = payload?.details;
  const detailMessage = [
    details?.code,
    details?.message,
    details?.details,
    details?.hint,
  ]
    .filter(Boolean)
    .join(" - ");

  return detailMessage ? `${baseMessage}: ${detailMessage}` : baseMessage;
}

export default function AccessLogs() {
  const [page, setPage] = useState(1);
  const accessLogsQuery = useAccessLogsQuery<AccessLog>(page, LOGS_PER_PAGE);
  const logs = accessLogsQuery.data?.logs || [];
  const totalLogs = accessLogsQuery.data?.total || 0;
  const totalPages = accessLogsQuery.data?.totalPages || 1;
  const loading = accessLogsQuery.isLoading;
  const loadError = accessLogsQuery.isError
    ? getAccessLogsErrorMessage(accessLogsQuery.error)
    : "";

  const safePage = Math.min(page, totalPages);

  const pageLabel = getPageRangeLabel({
    currentCount: logs.length,
    page: safePage,
    pageSize: LOGS_PER_PAGE,
    total: totalLogs,
  });

  if (loading) {
    return <AdminTablePageSkeleton />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-white flex items-center gap-3">
          <PixelIcon className="text-synth-secondary w-8 h-8" name="logs" />
          User Sessions
        </h1>
        <span className="bg-synth-secondary/15 text-synth-secondary border border-synth-secondary/30 px-4 py-2 rounded-full font-semibold">
          {totalLogs} Sessions
        </span>
      </div>

      <div className="bg-[#2B1720] border border-synth-border rounded-lg overflow-hidden shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-synth-bg border-b border-synth-border text-xs uppercase tracking-wider text-gray-500 font-bold">
                <th className="p-4">User</th>
                <th className="p-4">Sessions</th>
                <th className="p-4">First Seen</th>
                <th className="p-4">Last Seen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-synth-border/80">
              {loadError ? (
                <tr>
                  <td colSpan={4} className="p-10 text-center text-sm text-red-300">
                    <div className="flex flex-col items-center gap-4">
                      <span>{loadError}</span>
                      <button
                        type="button"
                        onClick={() => void accessLogsQuery.refetch()}
                        className="h-10 rounded-lg border border-red-400/40 bg-red-500/10 px-4 text-sm font-semibold text-red-200 transition-colors hover:border-red-300 hover:bg-red-500/20"
                      >
                        Retry
                      </button>
                    </div>
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-10 text-center text-sm text-gray-500">
                    No user sessions found.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr
                    key={log.user_id || "guest"}
                    className="hover:bg-[#351B27] transition-colors"
                  >
                    <td className="p-4">
                      {log.user_id ? (
                        <span className="text-white font-bold">
                          @{log.username || "unknown"}
                        </span>
                      ) : (
                        <span className="text-gray-400 italic">Guest</span>
                      )}
                    </td>
                    <td className="p-4 text-gray-300 text-sm font-semibold">
                      {log.sessions_count}
                    </td>
                    <td className="p-4 text-gray-400 text-sm">
                      {new Date(log.first_seen_at).toLocaleString()}
                    </td>
                    <td className="p-4 text-gray-400 text-sm">
                      {new Date(log.last_seen_at).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-gray-500">
          {pageLabel}
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
