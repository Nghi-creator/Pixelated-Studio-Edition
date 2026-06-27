type VerifyBackendSessionOptions = {
  apiUrl: string;
  sessionId: string;
  sessionToken: string;
};

export type VerifiedBackendSession = {
  expectedSha256?: string | null;
  expectedSizeBytes?: number | null;
  launchManifestId?: string | null;
  mode: string;
  romTarget?: string | null;
  runtimeId?: string;
  userId?: string;
};

export async function verifyBackendSession(
  options: VerifyBackendSessionOptions,
): Promise<VerifiedBackendSession> {
  const { apiUrl, sessionId, sessionToken } = options;

  if (!apiUrl) {
    throw new Error("Cloud session verification is not configured.");
  }

  if (!sessionId || !sessionToken) {
    throw new Error("Missing cloud session credentials.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(
      `${apiUrl}/sessions/${encodeURIComponent(sessionId)}/verify`,
      {
        body: JSON.stringify({ sessionToken }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      throw new Error(`Backend rejected cloud session (${response.status}).`);
    }

    const verifiedSession = (await response.json()) as {
      boot?: {
        artifactSha256?: unknown;
        artifactSize?: unknown;
        launchManifestId?: unknown;
        romFilename?: unknown;
        runtimeId?: unknown;
        romUrl?: unknown;
      };
      mode?: unknown;
      user?: {
        id?: unknown;
      };
    };
    const romTarget =
      typeof verifiedSession.boot?.romUrl === "string"
        ? verifiedSession.boot.romUrl
        : typeof verifiedSession.boot?.romFilename === "string"
          ? verifiedSession.boot.romFilename
          : "";

    const launchManifestId =
      typeof verifiedSession.boot?.launchManifestId === "string"
        ? verifiedSession.boot.launchManifestId
        : null;
    if (!romTarget && !launchManifestId) {
      throw new Error("Backend session has no approved boot target.");
    }

    return {
      expectedSha256:
        typeof verifiedSession.boot?.artifactSha256 === "string"
          ? verifiedSession.boot.artifactSha256
          : null,
      expectedSizeBytes:
        typeof verifiedSession.boot?.artifactSize === "number"
          ? verifiedSession.boot.artifactSize
          : null,
      launchManifestId,
      mode:
        typeof verifiedSession.mode === "string" ? verifiedSession.mode : "",
      romTarget,
      runtimeId:
        typeof verifiedSession.boot?.runtimeId === "string"
          ? verifiedSession.boot.runtimeId
          : undefined,
      userId:
        typeof verifiedSession.user?.id === "string"
          ? verifiedSession.user.id
          : undefined,
    };
  } finally {
    clearTimeout(timeout);
  }
}
