import { useCallback, useEffect, useRef, useState } from "react";
import { api, getAuthSession } from "../../lib/api/apiClient";
import type { AdminConfirmation } from "../../components/admin/AdminConfirmDialog";
import {
  getAdminApiErrorMessage,
  getPageRangeLabel,
} from "./adminState";

export const USERS_PER_PAGE = 25;

export interface AdminUserProfile {
  id: string;
  username: string | null;
  avatar_url: string | null;
  role: string;
  is_banned: boolean;
  created_at: string;
}

export function useAdminUsers() {
  const [users, setUsers] = useState<AdminUserProfile[]>([]);
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
        patch: Partial<Pick<AdminUserProfile, "is_banned" | "role">>;
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
        const data = await api.users<AdminUserProfile>({
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

  const handleSearchChange = (nextSearchQuery: string) => {
    setSearchQuery(nextSearchQuery);
    setPage(1);
    setLoadError("");
  };

  const retryLoad = () => setReloadKey((key) => key + 1);

  const handleToggleRole = (userId: string, currentRole: string) => {
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

  const handleToggleBan = (userId: string, currentBanStatus: boolean) => {
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

  return {
    actionError,
    applyConfirmedAction,
    confirmation,
    currentUserId,
    currentUserRole,
    handleSearchChange,
    handleToggleBan,
    handleToggleRole,
    loadError,
    loading,
    page,
    pageLabel: getPageRangeLabel({
      currentCount: users.length,
      page,
      pageSize: USERS_PER_PAGE,
      total: totalUsers,
    }),
    pendingUserId,
    retryLoad,
    searchQuery,
    setConfirmation,
    setPage,
    totalPages,
    totalUsers,
    users,
  };
}
