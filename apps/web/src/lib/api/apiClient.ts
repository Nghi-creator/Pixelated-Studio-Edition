import { supabase } from "../auth/supabaseClient";
import type { Session } from "@supabase/supabase-js";
import {
  createRequestAbortController,
  withTimeout,
} from "./requestLifecycle";
import {
  cacheValueForCurrentEntry,
  clearAuthScopedCache,
  type AsyncCacheEntry,
} from "../auth/authCache";
import { clearAuthScopedQueries, queryClient } from "./queryClient";
import type { ApiPermissionsResponse } from "./apiTypes";
import { createAdminApi } from "./adminApi";
import { createCatalogApi } from "./catalogApi";
import { createEngineApi } from "./engineApi";
import { createProfileApi } from "./profileApi";
import { createSessionApi } from "./sessionApi";
import { createSocialApi } from "./socialApi";
import { createTelemetryApi } from "./telemetryApi";

export type * from "./apiTypes";

const LOCAL_API_URL = "http://127.0.0.1:4000";
const PRODUCTION_API_URL = "https://pixelated-api-services-6ovi.onrender.com";
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
  permissions: null as AsyncCacheEntry<ApiPermissionsResponse> | null,
  favorites: null as AsyncCacheEntry<Set<string>> | null,
};

let currentAuthUserId: string | null | undefined;

supabase.auth.onAuthStateChange((_event, session) => {
  clearAuthScopedCache(authScopedCache);

  const nextAuthUserId = session?.user.id ?? null;
  if (
    currentAuthUserId !== undefined &&
    currentAuthUserId !== nextAuthUserId
  ) {
    void clearAuthScopedQueries(queryClient);
  }
  currentAuthUserId = nextAuthUserId;
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

export function clearFavoritesCache() {
  authScopedCache.favorites = null;
}

export function clearPermissionsCache() {
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

export async function apiRequestBlob(
  path: string,
  { timeoutMs = DEFAULT_API_TIMEOUT_MS }: { timeoutMs?: number } = {},
) {
  const session = await withTimeout(
    getAuthSession(),
    timeoutMs,
    () => new ApiError(0, { error: "Authentication did not respond in time." }),
  );
  const headers = new Headers({ Accept: "application/octet-stream" });
  if (session?.access_token) {
    headers.set("Authorization", `Bearer ${session.access_token}`);
  }
  const { controller, cleanup } = createRequestAbortController(timeoutMs);

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      cache: "no-store",
      headers,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new ApiError(0, { error: "The smoke-test artifact timed out." });
    }
    throw error;
  } finally {
    cleanup();
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new ApiError(response.status, payload);
  }
  return response.blob();
}

export async function getCachedPermissions(): Promise<ApiPermissionsResponse> {
  if (isCacheFresh(authScopedCache.permissions) && authScopedCache.permissions) {
    if (authScopedCache.permissions.value) return authScopedCache.permissions.value;
    return authScopedCache.permissions.promise;
  }

  const entry: AsyncCacheEntry<ApiPermissionsResponse> = {
    expiresAt: Date.now() + CLIENT_CACHE_TTL_MS,
    promise: apiRequest<ApiPermissionsResponse>("/me/permissions").then(
      (value) =>
        cacheValueForCurrentEntry(authScopedCache.permissions, entry, value),
    ),
  };
  authScopedCache.permissions = entry;
  return entry.promise;
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

  const entry: AsyncCacheEntry<Set<string>> = {
    expiresAt: Date.now() + CLIENT_CACHE_TTL_MS,
    promise: apiRequest<{ favorites: FavoriteLike[] }>("/favorites").then(
      ({ favorites }) => {
        const favoriteIds = new Set(
          favorites
            .map((favorite) => favorite.id || favorite.game_id)
            .filter((id): id is string => Boolean(id)),
        );
        return cacheValueForCurrentEntry(
          authScopedCache.favorites,
          entry,
          favoriteIds,
        );
      },
    ),
  };
  authScopedCache.favorites = entry;
  return entry.promise;
}

export const api = {
  ...createAdminApi({ apiRequest }),
  ...createCatalogApi({
    apiRequest,
    clearFavoritesCache,
    getFavoriteIds,
  }),
  ...createEngineApi({ apiRequest }),
  ...createProfileApi({
    apiRequest,
    clearPermissionsCache,
    getCachedPermissions,
  }),
  ...createSessionApi({ apiRequest }),
  ...createSocialApi({ apiRequest }),
  ...createTelemetryApi({ apiRequest }),
};
