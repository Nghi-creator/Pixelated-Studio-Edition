import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, getAuthSession } from "../../lib/api/apiClient";
import { queryKeys } from "../../lib/api/queryClient";
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
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<
    | (AdminConfirmation & {
        patch: Partial<Pick<AdminUserProfile, "is_banned" | "role">>;
      })
    | null
  >(null);
  const queryClient = useQueryClient();

  const sessionQuery = useQuery({
    queryKey: ["authSession"],
    queryFn: getAuthSession,
  });
  const permissionsQuery = useQuery({
    enabled: Boolean(sessionQuery.data?.user),
    queryKey: queryKeys.permissions(),
    queryFn: api.permissions,
  });
  const currentUserId = sessionQuery.data?.user?.id || "";
  const currentUserRole = permissionsQuery.data?.profile.role || "";
  const canManageUsers = currentUserRole === "super_admin";

  const usersQuery = useQuery({
    enabled: canManageUsers,
    queryKey: queryKeys.adminUsers(page, USERS_PER_PAGE, searchQuery),
    queryFn: () =>
      api.users<AdminUserProfile>({
        page,
        pageSize: USERS_PER_PAGE,
        search: searchQuery,
      }),
  });

  useEffect(() => {
    if (usersQuery.data) {
      setUsers(usersQuery.data.users);
      if (page > usersQuery.data.totalPages) {
        setPage(usersQuery.data.totalPages);
      }
    }
  }, [page, usersQuery.data]);

  useEffect(() => {
    if (permissionsQuery.isError) {
      setLoadError("Could not verify user-management permissions.");
      return;
    }

    if (usersQuery.isError) {
      setLoadError(
        getAdminApiErrorMessage(usersQuery.error, "Could not load users."),
      );
    }
  }, [
    permissionsQuery.isError,
    usersQuery.error,
    usersQuery.isError,
  ]);

  const handleSearchChange = (nextSearchQuery: string) => {
    setSearchQuery(nextSearchQuery);
    setPage(1);
    setLoadError("");
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

  const updateUserMutation = useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<Pick<AdminUserProfile, "is_banned" | "role">>;
    }) => api.updateAdminUser(id, patch),
    onError: (error) => {
      console.error(error);
      setActionError(getAdminApiErrorMessage(error, "User update failed."));
    },
    onSuccess: async ({ user }) => {
      setUsers((prev) =>
        prev.map((currentUser) =>
          currentUser.id === user.id ? { ...currentUser, ...user } : currentUser,
        ),
      );
      setConfirmation(null);
      await queryClient.invalidateQueries({
        queryKey: queryKeys.adminUsers(page, USERS_PER_PAGE, searchQuery),
      });
    },
    onSettled: () => setPendingUserId(null),
  });

  const applyConfirmedAction = async () => {
    if (!confirmation || pendingUserId) return;
    const { id, patch } = confirmation;
    setPendingUserId(id);
    setActionError("");
    await updateUserMutation.mutateAsync({ id, patch }).catch(() => undefined);
  };

  const totalUsers = usersQuery.data?.total || 0;
  const totalPages = usersQuery.data?.totalPages || 1;
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
