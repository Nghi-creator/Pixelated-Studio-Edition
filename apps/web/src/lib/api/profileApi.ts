import type {
  ApiMeResponse,
  ApiPermissionsResponse,
  ApiProfile,
} from "./apiTypes";

type ProfileApiDependencies = {
  apiRequest: <T>(path: string, options?: RequestInit & { authenticated?: boolean; timeoutMs?: number }) => Promise<T>;
  clearPermissionsCache: () => void;
  getCachedPermissions: () => Promise<ApiPermissionsResponse>;
};

export function createProfileApi({
  apiRequest,
  clearPermissionsCache,
  getCachedPermissions,
}: ProfileApiDependencies) {
  return {
    deleteAccount: () =>
      apiRequest<void>("/me/account", {
        body: JSON.stringify({ confirmation: "DELETE" }),
        method: "DELETE",
      }),
    me: () => apiRequest<ApiMeResponse>("/me"),
    permissions: () => getCachedPermissions(),
    profile: () => apiRequest<{ profile: ApiProfile | null }>("/profile"),
    updateProfile: async (payload: {
      avatarUrl: string | null;
      username: string;
    }) => {
      const result = await apiRequest<{ success: true }>("/profile", {
        body: JSON.stringify(payload),
        method: "PATCH",
      });
      clearPermissionsCache();
      return result;
    },
  };
}
