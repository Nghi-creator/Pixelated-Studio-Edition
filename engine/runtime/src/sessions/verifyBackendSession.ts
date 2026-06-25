type VerifyBackendSessionOptions = {
  apiUrl: string;
  sessionId: string;
  sessionToken: string;
};

export type VerifiedBackendSession = {
  mode: string;
  romTarget: string;
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

    if (!romTarget) {
      throw new Error("Backend session has no approved ROM target.");
    }

    return {
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
