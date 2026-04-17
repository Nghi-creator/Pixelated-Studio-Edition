import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { Users } from "lucide-react";

interface Profile {
  id: string;
  username: string;
  avatar_url: string;
  role: string;
  is_banned: boolean;
  created_at: string;
}

export default function UserManagement() {
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [currentUserRole, setCurrentUserRole] = useState<string>("");

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        setCurrentUserId(session.user.id);
        const { data } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", session.user.id)
          .single();
        if (data) setCurrentUserRole(data.role);
      }
    });

    const fetchUsers = async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching users:", error);
      } else {
        setUsers(data || []);
      }
      setLoading(false);
    };

    fetchUsers();
  }, []);

  // --- TOGGLE ROLE ---
  const handleToggleRole = async (userId: string, currentRole: string) => {
    const newRole = currentRole === "admin" ? "user" : "admin";
    const confirmMessage =
      newRole === "admin"
        ? "Are you sure you want to promote this user to Admin?"
        : "Are you sure you want to demote this Admin to a regular user?";

    if (!window.confirm(confirmMessage)) return;

    const { data, error } = await supabase
      .from("profiles")
      .update({ role: newRole })
      .eq("id", userId)
      .select()
      .single();

    if (error || !data) {
      alert("Database update failed! Please run the SQL policy script.");
      console.error(error);
    } else {
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u)),
      );
    }
  };

  // --- TOGGLE BAN ---
  const handleToggleBan = async (userId: string, currentBanStatus: boolean) => {
    const newBanStatus = !currentBanStatus;
    const confirmMessage = newBanStatus
      ? "Are you sure you want to permanently ban this user?"
      : "Are you sure you want to UNBAN this user?";

    if (!window.confirm(confirmMessage)) return;

    const { data, error } = await supabase
      .from("profiles")
      .update({ is_banned: newBanStatus })
      .eq("id", userId)
      .select()
      .single();

    if (error || !data) {
      alert("Database update failed! Please run the SQL policy script.");
      console.error(error);
    } else {
      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId ? { ...u, is_banned: newBanStatus } : u,
        ),
      );
    }
  };

  if (loading) {
    return <div className="text-gray-400">Loading user database...</div>;
  }

  if (currentUserRole !== "super_admin") {
    return (
      <div className="bg-red-500/10 border border-red-500/30 p-8 rounded-xl text-center">
        <h2 className="text-red-400 font-bold text-xl mb-2">Access Denied</h2>
        <p className="text-gray-400">
          Only Super Admins can manage user roles and issue bans from this
          panel.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-white flex items-center gap-3">
          <Users className="text-synth-primary w-8 h-8 drop-shadow-[0_0_12px_rgba(255,77,143,0.45)]" />
          User Management
        </h1>
        <span className="bg-synth-secondary/15 text-synth-secondary border border-synth-secondary/30 px-4 py-2 rounded-full font-semibold">
          {users.length} Total Users
        </span>
      </div>

      <div className="bg-synth-surface border border-synth-border rounded-xl overflow-hidden shadow-glow-card">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-synth-bg border-b border-synth-border text-xs uppercase tracking-wider text-gray-500 font-bold">
                <th className="p-4">User</th>
                <th className="p-4">Joined</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-synth-border/80">
              {users.map((user) => {
                const isSelf = user.id === currentUserId;
                const isTargetSuperAdmin = user.role === "super_admin";

                return (
                  <tr
                    key={user.id}
                    className="hover:bg-synth-primary/5 transition-colors"
                  >
                    {/* User Info */}
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <img
                          src={
                            user.avatar_url ||
                            `https://ui-avatars.com/api/?name=${user.username}&background=FF4D8F&color=000000`
                          }
                          alt="avatar"
                          className="w-10 h-10 rounded-full border border-synth-border object-cover"
                        />
                        <div>
                          <div className="text-white font-bold flex items-center gap-2">
                            @{user.username || "Unknown"}
                            {isSelf && (
                              <span className="text-xs bg-synth-primary/20 text-synth-primary px-2 py-0.5 rounded-full border border-synth-primary/30">
                                You
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Joined Date */}
                    <td className="p-4 text-gray-400 text-sm">
                      {new Date(user.created_at).toLocaleDateString()}
                    </td>

                    {/* Status Badge */}
                    <td className="p-4">
                      {user.is_banned ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold">
                          Banned
                        </span>
                      ) : user.role === "super_admin" ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20">
                          Super Admin
                        </span>
                      ) : user.role === "admin" ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold">
                          Admin
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold">
                          Active
                        </span>
                      )}
                    </td>

                    {/* Dynamic Actions Column */}
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {isSelf ? (
                          <span className="text-gray-600 text-sm italic pr-2">
                            No actions available
                          </span>
                        ) : isTargetSuperAdmin ? (
                          <span className="text-gray-600 text-sm italic pr-2">
                            Cannot modify Super Admins
                          </span>
                        ) : (
                          <>
                            {/* Toggle Role Button */}
                            <button
                              onClick={() =>
                                handleToggleRole(user.id, user.role)
                              }
                              className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-all ${
                                user.role === "admin"
                                  ? "bg-synth-elevated text-gray-300 hover:bg-synth-border"
                                  : "bg-synth-secondary/15 text-synth-secondary hover:bg-synth-secondary/25 border border-synth-secondary/25"
                              }`}
                            >
                              {user.role === "admin" ? "Demote" : "Make Admin"}
                            </button>

                            {/* Toggle Ban Button */}
                            <button
                              onClick={() =>
                                handleToggleBan(user.id, user.is_banned)
                              }
                              className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-all ${
                                user.is_banned
                                  ? "bg-synth-elevated text-gray-300 hover:bg-synth-border hover:text-white"
                                  : "bg-red-500/10 text-red-500 hover:bg-red-500/20"
                              }`}
                            >
                              {user.is_banned ? "Unban" : "Ban"}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
