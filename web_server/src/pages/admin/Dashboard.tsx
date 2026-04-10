import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { Check, LayoutDashboard, Filter } from "lucide-react";
import ReportCard, { type Report } from "../../components/admin/ReportCard";

type FilterType = "all" | "users" | "admins";

export default function Dashboard() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [currentUserRole, setCurrentUserRole] = useState<string>("");
  const [filter, setFilter] = useState<FilterType>("all");

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) setCurrentUserId(session.user.id);
    });

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        setCurrentUserId(session.user.id);

        const { data } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", session.user.id)
          .single();

        if (data) {
          setCurrentUserRole(data.role);
        }
      }
    });

    const fetchReports = async () => {
      const { data, error } = await supabase
        .from("reported_comments")
        .select(
          `
          id,
          reason,
          created_at,
          comments (
            id,
            content,
            profiles ( id, username, role ) 
          ),
          profiles ( id, username )
        `,
        )
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching reports:", error);
      } else {
        // @ts-expect-error - Supabase's type inference struggles with nested selects, so we assert the type here
        setReports(data || []);
      }
      setLoading(false);
    };

    fetchReports();
  }, []);

  const handleIgnore = async (reportId: string) => {
    await supabase.from("reported_comments").delete().eq("id", reportId);
    setReports((prev) => prev.filter((r) => r.id !== reportId));
  };

  const handleDeleteComment = async (commentId: string) => {
    await supabase.from("comments").delete().eq("id", commentId);
    setReports((prev) => prev.filter((r) => r.comments?.id !== commentId));
  };

  const handleBanUser = async (userId: string, commentId: string) => {
    if (!window.confirm("Are you sure you want to ban this user permanently?"))
      return;

    await supabase
      .from("profiles")
      .update({ is_banned: true })
      .eq("id", userId);
    await supabase.from("comments").delete().eq("id", commentId);
    setReports((prev) => prev.filter((r) => r.comments?.id !== commentId));
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

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-3xl font-bold text-white flex items-center gap-3">
          <LayoutDashboard className="text-[#00f2fe] w-8 h-8" />
          Moderation Queue
        </h1>

        <div className="flex items-center gap-3">
          {/* Filter Dropdown */}
          <div className="relative flex items-center bg-[#111827] border border-gray-800 rounded-lg px-3 py-2">
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

          <span className="bg-gray-800 text-gray-300 px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap">
            {filteredReports.length} Pending
          </span>
        </div>
      </div>

      {/* Reports Feed */}
      {filteredReports.length === 0 ? (
        <div className="bg-[#111827] border border-gray-800 rounded-xl p-12 text-center text-gray-400">
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
    </div>
  );
}
