import { sanitizeUserId } from "../roms/localRomStore";
import { getRuntimeDefinition } from "../runtime/runtimeRegistry";

export type IceServer = {
  credential?: string;
  urls: string | string[];
  username?: string;
};

export type StreamProfile = {
  bitrateKbps: number;
  fps: number;
  id: string;
};

export type StartGamePayload = {
  iceServers?: unknown;
  mode?: unknown;
  romFilename?: unknown;
  sessionId?: unknown;
  sessionToken?: unknown;
  streamProfile?: unknown;
  userId?: unknown;
};

export type VerifiedBackendSession = {
  expectedSha256?: string | null;
  expectedSizeBytes?: number | null;
  launchManifestId?: string | null;
  mode: string;
  romTarget?: string | null;
  runtimeId?: string | null;
  userId?: string | null;
};

export type VerifyBackendSession = (options: {
  apiUrl: string;
  sessionId: string;
  sessionToken: string;
}) => Promise<VerifiedBackendSession>;

export type VerifiedCloudBoot = {
  expectedSha256?: string | null;
  expectedSizeBytes?: number | null;
  launchManifestId?: string | null;
  romFileOrUrl: string;
  runtimeId: string;
  safeUserId: string;
};

function normalizeStartMode(mode: unknown) {
  return typeof mode === "string" ? mode.trim().toLowerCase() : "";
}

export function hasCloudSessionIntent(payload: StartGamePayload) {
  return (
    normalizeStartMode(payload.mode) === "cloud" || Boolean(payload.sessionToken)
  );
}

export function normalizeIceServers(value: unknown): IceServer[] {
  return Array.isArray(value)
    ? value
        .map((server): IceServer | null => {
          if (!server || typeof server !== "object") return null;
          const rawServer = server as Record<string, unknown>;
          const urls = Array.isArray(rawServer.urls)
            ? rawServer.urls.filter((url): url is string => typeof url === "string")
            : typeof rawServer.urls === "string"
              ? rawServer.urls
              : null;
          if (!urls || (Array.isArray(urls) && urls.length === 0)) return null;
          return {
            credential:
              typeof rawServer.credential === "string"
                ? rawServer.credential
                : undefined,
            urls,
            username:
              typeof rawServer.username === "string"
                ? rawServer.username
                : undefined,
          };
        })
        .filter((server): server is IceServer => Boolean(server))
    : [];
}

export function normalizeStreamProfile(value: unknown): StreamProfile {
  const profile = value && typeof value === "object" ? value : {};
  const rawProfile = profile as Record<string, unknown>;
  const fps = Number(rawProfile.fps);
  const bitrateKbps = Number(rawProfile.bitrateKbps);
  const id = typeof rawProfile.id === "string" ? rawProfile.id : "balanced";

  return {
    bitrateKbps:
      Number.isFinite(bitrateKbps) && bitrateKbps >= 500 && bitrateKbps <= 2500
        ? Math.round(bitrateKbps)
        : 1000,
    fps: Number.isFinite(fps) && fps >= 24 && fps <= 60 ? Math.round(fps) : 60,
    id: /^[a-z0-9_-]{1,40}$/i.test(id) ? id : "balanced",
  };
}

export async function resolveVerifiedCloudBoot(options: {
  apiUrl: string;
  safeUserId: string;
  sessionId: string;
  sessionToken: string;
  verifyBackendSession: VerifyBackendSession;
}): Promise<VerifiedCloudBoot> {
  const { apiUrl, safeUserId, sessionId, sessionToken, verifyBackendSession } =
    options;
  const verifiedSession = await verifyBackendSession({
    apiUrl,
    sessionId,
    sessionToken,
  });

  if (verifiedSession.mode !== "cloud") {
    throw new Error("Backend session is not approved for cloud boot.");
  }

  const romFileOrUrl = verifiedSession.romTarget || "";
  const runtimeId = verifiedSession.runtimeId || "";
  const verifiedRuntime = getRuntimeDefinition(runtimeId);
  if (!verifiedRuntime) {
    throw new Error("Backend session selected an unsupported runtime.");
  }

  const launchManifestId = verifiedSession.launchManifestId;
  if (verifiedRuntime.kind === "libretro" && !romFileOrUrl) {
    throw new Error("Backend session did not provide a ROM target.");
  }
  if (verifiedRuntime.kind === "native_linux" && !launchManifestId) {
    throw new Error("Backend session did not provide a launch manifest.");
  }

  return {
    expectedSha256: verifiedSession.expectedSha256,
    expectedSizeBytes: verifiedSession.expectedSizeBytes,
    launchManifestId,
    romFileOrUrl,
    runtimeId,
    safeUserId: sanitizeUserId(verifiedSession.userId || safeUserId),
  };
}
