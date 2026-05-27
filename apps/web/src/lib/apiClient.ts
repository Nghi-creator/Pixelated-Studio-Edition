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

export const api = {
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
  localPairing: () =>
    apiRequest<ApiLocalPairingResponse>("/local-pairings/current"),
  health: () =>
    apiRequest<{
      environment: string;
      ok: boolean;
      service: string;
      uptimeSeconds: number;
    }>("/health", { authenticated: false }),
  me: () => apiRequest<ApiMeResponse>("/me"),
  pairLocalEngine: (engineUrl: string) =>
    apiRequest<ApiLocalPairingResponse>("/local-pairings", {
      body: JSON.stringify({ engineUrl }),
      method: "POST",
    }),
  permissions: () => apiRequest<ApiPermissionsResponse>("/me/permissions"),
  reportComment: (commentId: string, reason: string) =>
    apiRequest<{ success: true }>(`/moderation/comments/${commentId}/report`, {
      body: JSON.stringify({ reason }),
      method: "POST",
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
};
