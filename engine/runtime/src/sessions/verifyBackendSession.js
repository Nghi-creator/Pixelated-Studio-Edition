async function verifyBackendSession(options) {
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

    const verifiedSession = await response.json();
    const romTarget =
      verifiedSession?.boot?.romUrl || verifiedSession?.boot?.romFilename;

    if (!romTarget) {
      throw new Error("Backend session has no approved ROM target.");
    }

    return {
      romTarget,
      userId: verifiedSession?.user?.id,
    };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { verifyBackendSession };
