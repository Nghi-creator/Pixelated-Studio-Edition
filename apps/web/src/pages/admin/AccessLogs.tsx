import { useEffect, useState } from "react";
import { Activity } from "lucide-react";
import { api } from "../../lib/apiClient";

const LOGS_PER_PAGE = 25;

interface AccessLog {
  id: string;
  created_at: string;
  user_id: string | null;
  path?: string;
  profiles: {
    username: string;
  } | null;
}

export default function AccessLogs() {
  const [logs, setLogs] = useState<AccessLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalLogs, setTotalLogs] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    const fetchLogs = async () => {
      setLoading(true);
      const data = await api.accessLogs<AccessLog>(page, LOGS_PER_PAGE);
      setLogs(data.logs);
      setTotalLogs(data.total);
      setTotalPages(data.totalPages);
      setLoading(false);
    };

    fetchLogs();
  }, [page]);

  const pageStart = totalLogs === 0 ? 0 : (page - 1) * LOGS_PER_PAGE + 1;
  const pageEnd = Math.min(page * LOGS_PER_PAGE, totalLogs);

  if (loading) {
    return <div className="text-gray-400">Loading access logs...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-white flex items-center gap-3">
          <Activity className="text-synth-primary w-8 h-8 drop-shadow-[0_0_12px_rgba(255,77,143,0.45)]" />
          User Sessions
        </h1>
        <span className="bg-synth-secondary/15 text-synth-secondary border border-synth-secondary/30 px-4 py-2 rounded-full font-semibold">
          {totalLogs} Sessions
        </span>
      </div>

      <div className="bg-synth-surface border border-synth-border rounded-xl overflow-hidden shadow-glow-card">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-synth-bg border-b border-synth-border text-xs uppercase tracking-wider text-gray-500 font-bold">
                <th className="p-4">User</th>
                <th className="p-4">Path</th>
                <th className="p-4">Session Logged At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-synth-border/80">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-synth-primary/5 transition-colors">
                  <td className="p-4">
                    {log.profiles ? (
                      <span className="text-white font-bold">@{log.profiles.username}</span>
                    ) : (
                      <span className="text-gray-400 italic">Guest</span>
                    )}
                  </td>
                  <td className="p-4 text-gray-400 text-sm">
                    {log.path || "/"}
                  </td>
                  <td className="p-4 text-gray-400 text-sm">
                    {new Date(log.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-gray-500">
          Showing {pageStart}-{pageEnd} of {totalLogs}
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
