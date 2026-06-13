import { supabase } from "./supabaseClient";
import type { Session } from "@supabase/supabase-js";
import {
  createRequestAbortController,
  withTimeout,
} from "./requestLifecycle";
import { clearAuthScopedCache } from "./authCache";

const LOCAL_API_URL = "http://127.0.0.1:4000";
const PRODUCTION_API_URL = "https://pixelated-api-services.onrender.com";
const DEFAULT_API_TIMEOUT_MS = 30_000;
const CLIENT_CACHE_TTL_MS = 30_000;

const isLocalBrowserHost = () => {
  if (typeof window === "undefined") return true;
  return ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
};

const getDefaultApiUrl = () => {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }

  return isLocalBrowserHost() ? LOCAL_API_URL : PRODUCTION_API_URL;
};

export const API_URL =
  getDefaultApiUrl().replace(/\/$/, "");

type ApiRequestOptions = RequestInit & {
  authenticated?: boolean;
  timeoutMs?: number;
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

const authScopedCache = {
  session: null as Promise<Session | null> | null,
  permissions: null as
    | {
      expiresAt: number;
      promise: Promise<ApiPermissionsResponse>;
      value?: ApiPermissionsResponse;
    }
    | null,
  favorites: null as
    | {
      expiresAt: number;
      promise: Promise<Set<string>>;
      value?: Set<string>;
    }
    | null,
};

supabase.auth.onAuthStateChange(() => {
  clearAuthScopedCache(authScopedCache);
});

export async function getAuthSession() {
  if (!authScopedCache.session) {
    authScopedCache.session = supabase.auth
      .getSession()
      .then(({ data: { session } }) => session ?? null)
      .catch((error) => {
        authScopedCache.session = null;
        throw error;
      });
  }

  return authScopedCache.session;
}

function isCacheFresh(cache: { expiresAt: number } | null) {
  return Boolean(cache && cache.expiresAt > Date.now());
}

function clearFavoritesCache() {
  authScopedCache.favorites = null;
}

function clearPermissionsCache() {
  authScopedCache.permissions = null;
}

export async function apiRequest<T>(
  path: string,
  {
    authenticated = true,
    headers,
    timeoutMs = DEFAULT_API_TIMEOUT_MS,
    ...options
  }: ApiRequestOptions = {},
) {
  const requestHeaders = new Headers(headers);
  requestHeaders.set("Accept", "application/json");

  if (options.body && !requestHeaders.has("Content-Type")) {
    requestHeaders.set("Content-Type", "application/json");
  }

  if (authenticated) {
    const session = await withTimeout(
      getAuthSession(),
      timeoutMs,
      () =>
        new ApiError(0, {
          error:
            "Authentication did not respond in time. Refresh the page and try again.",
        }),
    );

    if (session?.access_token) {
      requestHeaders.set("Authorization", `Bearer ${session.access_token}`);
    }
  }

  const { controller, cleanup } = createRequestAbortController(
    timeoutMs,
    options.signal,
  );

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: requestHeaders,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new ApiError(0, {
        error:
          "The API did not respond in time. The backend may be waking up; try again shortly.",
      });
    }

    throw error;
  } finally {
    cleanup();
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(response.status, payload);
  }

  return payload as T;
}

async function getCachedPermissions(): Promise<ApiPermissionsResponse> {
  if (isCacheFresh(authScopedCache.permissions) && authScopedCache.permissions) {
    if (authScopedCache.permissions.value) return authScopedCache.permissions.value;
    return authScopedCache.permissions.promise;
  }

  const promise = apiRequest<ApiPermissionsResponse>("/me/permissions").then(
    (value) => {
      if (authScopedCache.permissions) authScopedCache.permissions.value = value;
      return value;
    },
  );
  authScopedCache.permissions = {
    expiresAt: Date.now() + CLIENT_CACHE_TTL_MS,
    promise,
  };
  return promise;
}

type FavoriteLike = {
  id?: string;
  game_id?: string;
};

async function getFavoriteIds(): Promise<Set<string>> {
  if (isCacheFresh(authScopedCache.favorites) && authScopedCache.favorites) {
    if (authScopedCache.favorites.value) return authScopedCache.favorites.value;
    return authScopedCache.favorites.promise;
  }

  const promise = apiRequest<{ favorites: FavoriteLike[] }>("/favorites").then(
    ({ favorites }) => {
      const favoriteIds = new Set(
        favorites
          .map((favorite) => favorite.id || favorite.game_id)
          .filter((id): id is string => Boolean(id)),
      );
      if (authScopedCache.favorites) authScopedCache.favorites.value = favoriteIds;
      return favoriteIds;
    },
  );

  authScopedCache.favorites = {
    expiresAt: Date.now() + CLIENT_CACHE_TTL_MS,
    promise,
  };
  return promise;
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

export type ApiIceServer = {
  credential?: string;
  urls: string | string[];
  username?: string;
};

export type ApiIceServersResponse = {
  expiresAt: string | null;
  iceServers: ApiIceServer[];
  ttlSeconds: number;
};

export type ApiMultiplayerLobbyPayload = {
  engineUrl: string | null;
  exposureMode: "lan" | "local" | "unknown";
  gameId: string;
  maxPlayers: number;
  participants: {
    displayName: string;
    playerIndex: number | null;
    role: "host" | "player" | "spectator";
  }[];
};

export type ApiAdminReportAction = "ban_user" | "delete_comment" | "ignore";

export type ApiAdminReportActionResponse = {
  action: ApiAdminReportAction;
  commentId: string;
  reportId: string;
  success: true;
  targetUserId?: string;
};

export type ApiPaginatedAccessLogsResponse<TLog> = {
  logs: TLog[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type ApiPaginatedGamesResponse = {
  featuredGames: ApiGame[];
  games: ApiGame[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type ApiFeaturedGamesResponse = {
  featuredGames: ApiGame[];
};

export type ApiPaginatedUsersResponse<TUser> = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  users: TUser[];
};

export type ApiPaginatedReportsResponse<TReport> = {
  page: number;
  pageSize: number;
  reports: TReport[];
  total: number;
  totalPages: number;
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
  accessLogs: <TLog>(page = 1, pageSize = 25) =>
    apiRequest<ApiPaginatedAccessLogsResponse<TLog>>(
      `/admin/access-logs?page=${page}&pageSize=${pageSize}`,
    ),
  adminReports: <TReport>(page = 1, pageSize = 25) =>
    apiRequest<ApiPaginatedReportsResponse<TReport>>(
      `/admin/reports?page=${page}&pageSize=${pageSize}`,
    ),
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
  favoriteStatus: async (gameId: string) => ({
    favorited: (await getFavoriteIds()).has(gameId),
  }),
  games: ({
    page = 1,
    pageSize = 15,
    search = "",
  }: {
    page?: number;
    pageSize?: number;
    search?: string;
  } = {}) => {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });
    if (search.trim()) params.set("search", search.trim());

    return apiRequest<ApiPaginatedGamesResponse>(`/games?${params}`, {
      authenticated: false,
    });
  },
  featuredGames: () =>
    apiRequest<ApiFeaturedGamesResponse>("/games/featured", {
      authenticated: false,
      cache: "no-store",
    }),
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
  iceServers: () => apiRequest<ApiIceServersResponse>("/webrtc/ice-servers"),
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
  logAccess: (path: string, sessionId: string) =>
    apiRequest<{ success: true }>("/access-logs", {
      body: JSON.stringify({ path, sessionId }),
      method: "POST",
    }),
  me: () => apiRequest<ApiMeResponse>("/me"),
  multiplayerLobby: (sessionId: string, payload: ApiMultiplayerLobbyPayload) =>
    apiRequest<{ lobby: unknown }>(`/multiplayer/lobbies/${sessionId}`, {
      body: JSON.stringify(payload),
      method: "PUT",
    }),
  endMultiplayerLobby: (sessionId: string) =>
    apiRequest<void>(`/multiplayer/lobbies/${sessionId}`, {
      method: "DELETE",
    }),
  pairLocalEngine: (engineUrl: string) =>
    apiRequest<ApiLocalPairingResponse>("/local-pairings", {
      body: JSON.stringify({ engineUrl }),
      method: "POST",
    }),
  permissions: () => getCachedPermissions(),
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
  saveFavorite: async (gameId: string) => {
    const result = await apiRequest<{ favorited: true }>(`/favorites/${gameId}`, {
      method: "PUT",
    });
    clearFavoritesCache();
    return result;
  },
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
  removeFavorite: async (gameId: string) => {
    const result = await apiRequest<void>(`/favorites/${gameId}`, {
      method: "DELETE",
    });
    clearFavoritesCache();
    return result;
  },
  updateAdminUser: (userId: string, patch: Partial<Pick<ApiProfile, "is_banned" | "role">>) =>
    apiRequest<{ user: ApiProfile }>(`/admin/users/${userId}`, {
      body: JSON.stringify(patch),
      method: "PATCH",
    }),
  updateProfile: async (payload: { avatarUrl: string | null; username: string }) => {
    const result = await apiRequest<{ success: true }>("/profile", {
      body: JSON.stringify(payload),
      method: "PATCH",
    });
    clearPermissionsCache();
    return result;
  },
  users: <TUser = Required<ApiProfile>>({
    page = 1,
    pageSize = 25,
    search = "",
  }: {
    page?: number;
    pageSize?: number;
    search?: string;
  } = {}) => {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });
    if (search.trim()) params.set("search", search.trim());

    return apiRequest<ApiPaginatedUsersResponse<TUser>>(
      `/admin/users?${params}`,
    );
  },
};
