import { useCallback, useEffect, useState } from "react";
import { Search, Users } from "lucide-react";
import { api, getAuthSession } from "../../lib/apiClient";
import { Avatar } from "../../components/ui/Avatar";
import { AdminTablePageSkeleton } from "../../components/ui/Skeleton";

const USERS_PER_PAGE = 25;

interface Profile {
  id: string;
  username: string | null;
  avatar_url: string | null;
  role: string;
  is_banned: boolean;
  created_at: string;
}

export default function UserManagement() {
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [currentUserRole, setCurrentUserRole] = useState<string>("");
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [totalPages, setTotalPages] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);

  useEffect(() => {
    let isMounted = true;

    const fetchCurrentUser = async () => {
      const session = await getAuthSession();

      if (session?.user && isMounted) {
        setCurrentUserId(session.user.id);
        const data = await api.permissions();
        if (isMounted) {
          setCurrentUserRole(data.profile.role);
          if (data.profile.role !== "super_admin") setLoading(false);
        }
      } else if (isMounted) {
        setLoading(false);
      }
    };

    fetchCurrentUser();

    return () => {
      isMounted = false;
    };
  }, []);

  const fetchUsers = useCallback(
    async (isMounted = true) => {
      if (currentUserRole !== "super_admin") return;

      setLoading(true);
      const data = await api.users<Profile>({
        page,
        pageSize: USERS_PER_PAGE,
        search: searchQuery,
      });
      if (!isMounted) return;

      setUsers(data.users);
      setTotalUsers(data.total);
      setTotalPages(data.totalPages);
      if (page > data.totalPages) {
        setPage(data.totalPages);
      }
      setLoading(false);
    },
    [currentUserRole, page, searchQuery],
  );

  useEffect(() => {
    let isMounted = true;
    const timeout = window.setTimeout(() => {
      fetchUsers(isMounted);
    }, searchQuery ? 250 : 0);

    return () => {
      isMounted = false;
      window.clearTimeout(timeout);
    };
  }, [fetchUsers, searchQuery]);

  // --- TOGGLE ROLE ---
  const handleToggleRole = async (userId: string, currentRole: string) => {
    const newRole = currentRole === "admin" ? "user" : "admin";
    const confirmMessage =
      newRole === "admin"
        ? "Are you sure you want to promote this user to Admin?"
        : "Are you sure you want to demote this Admin to a regular user?";

    if (!window.confirm(confirmMessage)) return;

    try {
      await api.updateAdminUser(userId, { role: newRole });
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u)),
      );
    } catch (error) {
      alert("User update failed.");
      console.error(error);
    }
  };

  // --- TOGGLE BAN ---
  const handleToggleBan = async (userId: string, currentBanStatus: boolean) => {
    const newBanStatus = !currentBanStatus;
    const confirmMessage = newBanStatus
      ? "Are you sure you want to permanently ban this user?"
      : "Are you sure you want to UNBAN this user?";

    if (!window.confirm(confirmMessage)) return;

    try {
      await api.updateAdminUser(userId, { is_banned: newBanStatus });
      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId ? { ...u, is_banned: newBanStatus } : u,
        ),
      );
    } catch (error) {
      alert("User update failed.");
      console.error(error);
    }
  };

  if (loading) {
    return <AdminTablePageSkeleton hasSearch />;
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

  const pageStart = totalUsers === 0 ? 0 : (page - 1) * USERS_PER_PAGE + 1;
  const pageEnd = Math.min(pageStart + users.length - 1, totalUsers);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <h1 className="text-3xl font-bold text-white flex items-center gap-3">
          <Users className="text-synth-primary w-8 h-8 drop-shadow-[0_0_12px_rgba(255,77,143,0.45)]" />
          User Management
        </h1>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative w-full sm:w-72">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <Search className="h-4 w-4 text-gray-500" />
            </div>
            <input
              type="text"
              placeholder="Search username..."
              value={searchQuery}
              onChange={(event) => {
                setSearchQuery(event.target.value);
                setPage(1);
              }}
              className="block w-full rounded-lg border border-synth-border bg-synth-surface py-2 pl-10 pr-3 text-sm text-gray-300 placeholder-gray-500 shadow-inner transition-colors focus:border-synth-primary focus:outline-none focus:ring-1 focus:ring-synth-primary"
            />
          </div>

          <span className="bg-synth-secondary/15 text-synth-secondary border border-synth-secondary/30 px-4 py-2 rounded-full font-semibold whitespace-nowrap">
            {totalUsers} Total Users
          </span>
        </div>
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
              {users.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="p-10 text-center text-sm text-gray-500"
                  >
                    No users found.
                  </td>
                </tr>
              ) : (
                users.map((user) => {
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
                        <Avatar
                          alt="avatar"
                          name={user.username || "Unknown"}
                          src={user.avatar_url}
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
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-gray-500">
          Showing {pageStart}-{pageEnd} of {totalUsers}
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
