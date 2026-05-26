import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { Activity } from "lucide-react";

interface AccessLog {
  id: string;
  created_at: string;
  user_id: string | null;
  profiles: {
    username: string;
  } | null;
}

export default function AccessLogs() {
  const [logs, setLogs] = useState<AccessLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLogs = async () => {
      const { data, error } = await supabase
        .from("access_logs")
        .select(`
          id,
          created_at,
          user_id,
          profiles ( username )
        `)
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) {
        console.error("Error fetching access logs:", error);
      } else {
        // @ts-expect-error Supabase types typically return arrays even on join
        setLogs(data || []);
      }
      setLoading(false);
    };

    fetchLogs();

    const channel = supabase
      .channel("access_logs_changes")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "access_logs" },
        () => {
          // Re-fetch to seamlessly grab the new rows and their profile joins natively
          fetchLogs();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

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
          {logs.length} Recent Sessions
        </span>
      </div>

      <div className="bg-synth-surface border border-synth-border rounded-xl overflow-hidden shadow-glow-card">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-synth-bg border-b border-synth-border text-xs uppercase tracking-wider text-gray-500 font-bold">
                <th className="p-4">User</th>
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
                    {new Date(log.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
