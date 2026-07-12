import { useState } from "react";
import { useUpdateAdminUserMutation } from "./adminMutations";
import {
  useAdminUsersQuery,
  useAuthSessionQuery,
  usePermissionsQuery,
} from "../../lib/api/apiQueries";
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
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [actionError, setActionError] = useState("");
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<
    | (AdminConfirmation & {
        patch: Partial<Pick<AdminUserProfile, "is_banned" | "role">>;
      })
    | null
  >(null);

  const sessionQuery = useAuthSessionQuery();
  const permissionsQuery = usePermissionsQuery({
    enabled: Boolean(sessionQuery.data?.user),
  });
  const currentUserId = sessionQuery.data?.user?.id || "";
  const currentUserRole = permissionsQuery.data?.profile.role || "";
  const canManageUsers = currentUserRole === "super_admin";

  const usersQuery = useAdminUsersQuery<AdminUserProfile>({
    enabled: canManageUsers,
    page,
    pageSize: USERS_PER_PAGE,
    search: searchQuery,
  });

  const handleSearchChange = (nextSearchQuery: string) => {
    setSearchQuery(nextSearchQuery);
    setPage(1);
  };

  const retryLoad = () => {
    void usersQuery.refetch();
  };

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

  const updateUserMutation = useUpdateAdminUserMutation<AdminUserProfile>({
    page,
    pageSize: USERS_PER_PAGE,
    search: searchQuery,
    onError: (error) => {
      console.error(error);
      setActionError(getAdminApiErrorMessage(error, "User update failed."));
    },
    onSuccess: () => {
      setConfirmation(null);
    },
  });

  const applyConfirmedAction = async () => {
    if (!confirmation || pendingUserId) return;
    const { id, patch } = confirmation;
    setPendingUserId(id);
    setActionError("");
    await updateUserMutation
      .mutateAsync({ id, patch })
      .catch(() => undefined)
      .finally(() => setPendingUserId(null));
  };

  const totalUsers = usersQuery.data?.total || 0;
  const totalPages = usersQuery.data?.totalPages || 1;
  const safePage = Math.min(page, totalPages);
  const users = usersQuery.data?.users || [];
  const loadError = permissionsQuery.isError
    ? "Could not verify user-management permissions."
    : usersQuery.isError
      ? getAdminApiErrorMessage(usersQuery.error, "Could not load users.")
      : "";
  const loading =
    sessionQuery.isLoading ||
    permissionsQuery.isLoading ||
    (canManageUsers && usersQuery.isLoading);

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
    page: safePage,
    pageLabel: getPageRangeLabel({
      currentCount: users.length,
      page: safePage,
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
