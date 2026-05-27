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

export type ApiSessionResponse = {
  boot: {
    romFilename: string | null;
    romUrl: string | null;
  };
  engineUrl: string;
  expiresAt: string;
  sessionId: string;
  sessionToken: string;
  user: {
    id: string;
  };
};

export type ApiLocalPairingResponse = {
  pairing: {
    createdAt: string;
    engineUrl: string;
    pairingId: string;
    tokenStoredBy: "browser-local-storage";
    updatedAt: string;
  };
  status?: "paired";
};

export type ApiStreamMetricPayload = {
  bitrateKbps: number | null;
  connectionState: RTCPeerConnectionState;
  fps: number | null;
  iceConnectionState: RTCIceConnectionState;
  jitterMs: number | null;
  packetsLost: number;
  sessionId: string;
  timestamp: string;
};

export type ApiAdminReportAction = "ban_user" | "delete_comment" | "ignore";

export type ApiAdminReportActionResponse = {
  action: ApiAdminReportAction;
  commentId: string;
  reportId: string;
  success: true;
  targetUserId?: string;
};

export type ApiGameSubmissionPayload = {
  authorName: string;
  bannerUrl: string | null;
  coverUrl: string | null;
  description: string | null;
  email: string;
  gameTitle: string;
  romUrl: string;
};

export type ApiGame = {
  author_name?: string | null;
  backdrop_url?: string | null;
  cover_url: string;
  id: string;
  play_count?: number | null;
  rom_filename?: string | null;
  rom_url?: string | null;
  title: string;
};

export type ApiProfile = {
  avatar_url: string | null;
  created_at?: string;
  id?: string;
  is_banned?: boolean;
  role: string;
  username: string | null;
};

export const api = {
  accessLogs: <TLog>() => apiRequest<{ logs: TLog[] }>("/admin/access-logs"),
  adminReports: <TReport>() =>
    apiRequest<{ reports: TReport[] }>("/admin/reports"),
  adminReportAction: (reportId: string, action: ApiAdminReportAction) =>
    apiRequest<ApiAdminReportActionResponse>(
      `/admin/reports/${reportId}/action`,
      {
        body: JSON.stringify({ action }),
        method: "POST",
      },
    ),
  clearLocalPairing: () =>
    apiRequest<void>("/local-pairings/current", {
      method: "DELETE",
    }),
  countPlay: (gameId: string) =>
    apiRequest<{ success: true }>(`/games/${gameId}/play-count`, {
      method: "POST",
    }),
  createSession: (gameId: string, clientSessionId: string) =>
    apiRequest<ApiSessionResponse>("/sessions", {
      body: JSON.stringify({
        clientSessionId,
        gameId,
        mode: "cloud",
      }),
      method: "POST",
    }),
  deleteAccount: () =>
    apiRequest<void>("/me/account", {
      method: "DELETE",
    }),
  deleteComment: (commentId: string) =>
    apiRequest<void>(`/comments/${commentId}`, {
      method: "DELETE",
    }),
  favoriteStatus: (gameId: string) =>
    apiRequest<{ favorited: boolean }>(`/favorites/${gameId}`),
  games: () => apiRequest<{ games: ApiGame[] }>("/games", { authenticated: false }),
  game: (gameId: string) =>
    apiRequest<{ game: ApiGame }>(`/games/${gameId}`, { authenticated: false }),
  gameComments: <TComment>(gameId: string, page: number) =>
    apiRequest<{ comments: TComment[]; hasMore: boolean }>(
      `/games/${gameId}/comments?page=${page}`,
      { authenticated: false },
    ),
  gameReactions: (gameId: string) =>
    apiRequest<{ reactions: { is_like: boolean; user_id: string }[] }>(
      `/games/${gameId}/reactions`,
      { authenticated: false },
    ),
  listFavorites: <TFavorite>() => apiRequest<{ favorites: TFavorite[] }>("/favorites"),
  localPairing: () =>
    apiRequest<ApiLocalPairingResponse>("/local-pairings/current"),
  health: () =>
    apiRequest<{
      environment: string;
      ok: boolean;
      service: string;
      uptimeSeconds: number;
    }>("/health", { authenticated: false }),
  logAccess: (path: string) =>
    apiRequest<{ success: true }>("/access-logs", {
      body: JSON.stringify({ path }),
      method: "POST",
    }),
  me: () => apiRequest<ApiMeResponse>("/me"),
  pairLocalEngine: (engineUrl: string) =>
    apiRequest<ApiLocalPairingResponse>("/local-pairings", {
      body: JSON.stringify({ engineUrl }),
      method: "POST",
    }),
  permissions: () => apiRequest<ApiPermissionsResponse>("/me/permissions"),
  postComment: (gameId: string, content: string) =>
    apiRequest<{ success: true }>(`/games/${gameId}/comments`, {
      body: JSON.stringify({ content }),
      method: "POST",
    }),
  profile: () => apiRequest<{ profile: ApiProfile | null }>("/profile"),
  reportComment: (commentId: string, reason: string) =>
    apiRequest<{ success: true }>(`/moderation/comments/${commentId}/report`, {
      body: JSON.stringify({ reason }),
      method: "POST",
    }),
  saveFavorite: (gameId: string) =>
    apiRequest<{ favorited: true }>(`/favorites/${gameId}`, {
      method: "PUT",
    }),
  setCommentReaction: (commentId: string, isLike: boolean | null) =>
    apiRequest<{ reactions: { is_like: boolean; user_id: string }[] }>(
      `/comments/${commentId}/reaction`,
      {
        body: JSON.stringify({ isLike }),
        method: "PUT",
      },
    ),
  setGameReaction: (gameId: string, isLike: boolean | null) =>
    apiRequest<{ success: true }>(`/games/${gameId}/reaction`, {
      body: JSON.stringify({ isLike }),
      method: "PUT",
    }),
  submitGame: (payload: ApiGameSubmissionPayload) =>
    apiRequest<{ submission: { id: string; status: "pending" } }>(
      "/submissions/games",
      {
        body: JSON.stringify(payload),
        method: "POST",
      },
    ),
  streamMetric: (metric: ApiStreamMetricPayload) =>
    apiRequest<{ accepted: boolean; reason?: string }>("/metrics/stream", {
      body: JSON.stringify(metric),
      method: "POST",
    }),
  removeFavorite: (gameId: string) =>
    apiRequest<void>(`/favorites/${gameId}`, {
      method: "DELETE",
    }),
  updateAdminUser: (userId: string, patch: Partial<Pick<ApiProfile, "is_banned" | "role">>) =>
    apiRequest<{ user: ApiProfile }>(`/admin/users/${userId}`, {
      body: JSON.stringify(patch),
      method: "PATCH",
    }),
  updateProfile: (payload: { avatarUrl: string | null; username: string }) =>
    apiRequest<{ success: true }>("/profile", {
      body: JSON.stringify(payload),
      method: "PATCH",
    }),
  users: () => apiRequest<{ users: Required<ApiProfile>[] }>("/admin/users"),
};
