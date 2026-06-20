import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw, Search } from "lucide-react";
import { api, getAuthSession } from "../../lib/api/apiClient";
import { Avatar } from "../../components/ui/Avatar";
import { AdminTablePageSkeleton } from "../../components/ui/Skeleton";
import { Pagination } from "../../components/ui/Pagination";
import { PixelIcon } from "../../components/ui/PixelIcon";
import {
  AdminConfirmDialog,
  type AdminConfirmation,
} from "../../components/admin/AdminConfirmDialog";
import {
  getAdminApiErrorMessage,
  getPageRangeLabel,
} from "../../features/admin/adminState";

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
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<
    | (AdminConfirmation & {
        patch: Partial<Pick<Profile, "is_banned" | "role">>;
      })
    | null
  >(null);
  const pendingUserIdRef = useRef<string | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    let isMounted = true;

    const fetchCurrentUser = async () => {
      const session = await getAuthSession();

      if (session?.user && isMounted) {
        setCurrentUserId(session.user.id);
        try {
          const data = await api.permissions();
          if (isMounted) {
            setCurrentUserRole(data.profile.role);
            if (data.profile.role !== "super_admin") setLoading(false);
          }
        } catch (error) {
          console.error("Error checking admin permissions:", error);
          if (isMounted) {
            setLoadError("Could not verify user-management permissions.");
            setLoading(false);
          }
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

      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;

      try {
        setLoading(true);
        setLoadError("");
        const data = await api.users<Profile>({
          page,
          pageSize: USERS_PER_PAGE,
          search: searchQuery,
        });
        if (!isMounted || requestId !== requestIdRef.current) return;

        setUsers(data.users);
        setTotalUsers(data.total);
        setTotalPages(data.totalPages);
        if (page > data.totalPages) {
          setPage(data.totalPages);
        }
      } catch (error) {
        console.error("Error fetching users:", error);
        if (!isMounted || requestId !== requestIdRef.current) return;
        setLoadError(getAdminApiErrorMessage(error, "Could not load users."));
      } finally {
        if (isMounted && requestId === requestIdRef.current) setLoading(false);
      }
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
  }, [fetchUsers, reloadKey, searchQuery]);

  // --- TOGGLE ROLE ---
  const handleToggleRole = async (userId: string, currentRole: string) => {
    const newRole = currentRole === "admin" ? "user" : "admin";
    setConfirmation({
      body:
        newRole === "admin"
          ? "This gives the user moderator access to reports and admin areas."
          : "This removes moderator access from the selected admin account.",
      confirmLabel: newRole === "admin" ? "Make Admin" : "Demote Admin",
      id: userId,
      intent: newRole === "admin" ? "warning" : "danger",
      patch: { role: newRole },
      title: newRole === "admin" ? "Promote user?" : "Demote admin?",
    });
  };

  // --- TOGGLE BAN ---
  const handleToggleBan = async (userId: string, currentBanStatus: boolean) => {
    const newBanStatus = !currentBanStatus;
    setConfirmation({
      body: newBanStatus
        ? "This blocks the user from signing in and using the product."
        : "This restores the user's access to the product.",
      confirmLabel: newBanStatus ? "Ban User" : "Unban User",
      id: userId,
      intent: newBanStatus ? "danger" : "warning",
      patch: { is_banned: newBanStatus },
      title: newBanStatus ? "Ban user?" : "Unban user?",
    });
  };

  const applyConfirmedAction = async () => {
    if (!confirmation || pendingUserIdRef.current) return;
    const { id, patch } = confirmation;
    pendingUserIdRef.current = id;
    setPendingUserId(id);
    setActionError("");
    try {
      const { user } = await api.updateAdminUser(id, patch);
      setUsers((prev) =>
        prev.map((currentUser) =>
          currentUser.id === id ? { ...currentUser, ...user } : currentUser,
        ),
      );
      setConfirmation(null);
    } catch (error) {
      console.error(error);
      setActionError(getAdminApiErrorMessage(error, "User update failed."));
    } finally {
      pendingUserIdRef.current = null;
      setPendingUserId(null);
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

  const pageLabel = getPageRangeLabel({
    currentCount: users.length,
    page,
    pageSize: USERS_PER_PAGE,
    total: totalUsers,
  });

  return (
    <div className="space-y-6">
      {confirmation && (
        <AdminConfirmDialog
          confirmation={confirmation}
          isPending={pendingUserId === confirmation.id}
          onCancel={() => setConfirmation(null)}
          onConfirm={() => void applyConfirmedAction()}
        />
      )}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <h1 className="text-3xl font-bold text-white flex items-center gap-3">
          <PixelIcon className="text-synth-secondary w-8 h-8" name="users" />
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
                setLoadError("");
              }}
              className="block w-full rounded-lg border border-synth-border bg-synth-surface py-2 pl-10 pr-3 text-sm text-gray-300 placeholder-gray-500 shadow-inner transition-colors focus:border-synth-secondary focus:outline-none"
            />
          </div>

          <span className="bg-synth-secondary/15 text-synth-secondary border border-synth-secondary/30 px-4 py-2 rounded-full font-semibold whitespace-nowrap">
            {totalUsers} Total Users
          </span>
        </div>
      </div>

      {actionError && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {actionError}
        </div>
      )}

      <div className="bg-[#2B1720] border border-synth-border rounded-lg overflow-hidden shadow-card">
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
              {loadError ? (
                <tr>
                  <td
                    colSpan={4}
                    className="p-10 text-center text-sm text-red-300"
                  >
                    <div className="flex flex-col items-center gap-4">
                      <span>{loadError}</span>
                      <button
                        className="inline-flex h-10 items-center gap-2 rounded-lg border border-red-400/40 bg-red-500/10 px-4 text-sm font-semibold text-red-200 transition-colors hover:border-red-300 hover:bg-red-500/20"
                        onClick={() => setReloadKey((key) => key + 1)}
                        type="button"
                      >
                        <RefreshCw className="h-4 w-4" /> Retry
                      </button>
                    </div>
                  </td>
                </tr>
              ) : users.length === 0 ? (
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
                const isPending = pendingUserId === user.id;

                return (
                  <tr
                    key={user.id}
                    className="hover:bg-[#351B27] transition-colors"
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
                              <span className="text-xs bg-[#9B0048] text-white px-2 py-0.5 rounded-full border border-[#C02066]">
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
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/70 bg-red-500/20 px-3 py-1 text-xs font-bold text-red-200">
                          Banned
                        </span>
                      ) : user.role === "super_admin" ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold">
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
                              disabled={isPending || Boolean(pendingUserId)}
                              className="px-3 py-1.5 rounded-lg text-sm font-bold transition-all border border-[#C02066] bg-[#9B0048] text-white hover:bg-[#B00052]"
                            >
                              {isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : user.role === "admin" ? (
                                "Demote"
                              ) : (
                                "Make Admin"
                              )}
                            </button>

                            {/* Toggle Ban Button */}
                            <button
                              onClick={() =>
                                handleToggleBan(user.id, user.is_banned)
                              }
                              disabled={isPending || Boolean(pendingUserId)}
                              className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-all ${
                                user.is_banned
                                  ? "bg-synth-elevated text-gray-300 hover:bg-synth-border hover:text-white"
                                  : "border border-red-500/70 bg-red-500/20 text-red-200 hover:bg-red-500/30"
                              }`}
                            >
                              {isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : user.is_banned ? (
                                "Unban"
                              ) : (
                                "Ban"
                              )}
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
          {pageLabel}
        </p>
        <Pagination
          currentPage={page}
          disabled={loading || Boolean(pendingUserId)}
          onPageChange={setPage}
          totalPages={totalPages}
        />
      </div>
    </div>
  );
}
