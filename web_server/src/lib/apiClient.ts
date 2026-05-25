import { supabase } from "./supabaseClient";

export const API_URL =
  import.meta.env.VITE_API_URL?.replace(/\/$/, "") || "http://127.0.0.1:4000";

type ApiRequestOptions = RequestInit & {
  authenticated?: boolean;
};

export class ApiError extends Error {
  status: number;
  payload: unknown;

  constructor(status: number, payload: unknown) {
    super(`API request failed with status ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

export async function apiRequest<T>(
  path: string,
  { authenticated = true, headers, ...options }: ApiRequestOptions = {},
) {
  const requestHeaders = new Headers(headers);
  requestHeaders.set("Accept", "application/json");

  if (options.body && !requestHeaders.has("Content-Type")) {
    requestHeaders.set("Content-Type", "application/json");
  }

  if (authenticated) {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (session?.access_token) {
      requestHeaders.set("Authorization", `Bearer ${session.access_token}`);
    }
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: requestHeaders,
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(response.status, payload);
  }

  return payload as T;
}

export type ApiMeResponse = {
  user: {
    email: string | null;
    id: string;
  };
};

export type ApiPermissionsResponse = {
  abilities: {
    canAccessAdmin: boolean;
    canManageReports: boolean;
    canManageUsers: boolean;
    canPublishGames: boolean;
    isBanned: boolean;
  };
  profile: {
    avatar_url: string | null;
    email: string | null;
    is_banned: boolean;
    is_developer: boolean;
    role: string;
    username: string | null;
  };
  user: {
    email: string | null;
    id: string;
  };
};

export const api = {
  health: () =>
    apiRequest<{
      environment: string;
      ok: boolean;
      service: string;
      uptimeSeconds: number;
    }>("/health", { authenticated: false }),
  me: () => apiRequest<ApiMeResponse>("/me"),
  permissions: () => apiRequest<ApiPermissionsResponse>("/me/permissions"),
};
