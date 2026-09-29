// Self-contained: Playwright serializes this function into the hosted page.
export async function probeHostedNativePairing({ apiUrl: apiBaseUrl, gameId, sessionId }) {
  const request = async (stage, url, options = {}) => {
    const endpoint = new URL(url);
    // Never include auth headers, request bodies, or URL credentials in errors.
    const label = `${options.method || "GET"} ${endpoint.origin}${endpoint.pathname}`;
    try {
      return await fetch(url, { ...options, signal: AbortSignal.timeout(20_000) });
    } catch (error) {
      throw new Error(
        `${stage}: ${label} failed before an HTTP response (${error instanceof Error ? error.name : "network error"}). ` +
        "Inspect browser-request-failures.json and browser-console.json for CORS, CSP, TLS, or connection errors.",
      );
    }
  };
  const authToken = (() => {
    for (const [key, value] of Object.entries(window.localStorage)) {
      if (!key.startsWith("sb-") || !key.endsWith("-auth-token")) continue;
      try {
        const parsed = JSON.parse(value);
        if (typeof parsed?.access_token === "string") {
          return parsed.access_token;
        }
      } catch {
        // Ignore unrelated local storage entries.
      }
    }
    return "";
  })();
  if (!authToken) throw new Error("Native pairing probe requires a signed-in hosted browser session.");
  const engineUrl = window.localStorage.getItem("pixelated_engine_url");
  const engineControlUrl =
    window.localStorage.getItem("pixelated_engine_control_url") || engineUrl;
  const engineTokenValue =
    window.localStorage.getItem("pixelated_engine_control_token") ||
    window.localStorage.getItem("pixelated_engine_token") ||
    "";
  const companionToken = engineTokenValue.startsWith("companion:")
    ? engineTokenValue.slice("companion:".length)
    : engineTokenValue;
  const engineHeaders = {
    "X-Engine-Token": companionToken,
    "X-Pixelated-Client-Id": "hosted-native-smoke",
  };
  const getLocalCompanionControlUrl = (target) => {
    try {
      const url = new URL(target);
      const hostname = url.hostname.toLowerCase();
      const isLocalhost =
        hostname === "localhost" ||
        hostname === "127.0.0.1" ||
        hostname === "::1" ||
        hostname === "[::1]";
      if (!isLocalhost || url.port !== "8080") return null;
      url.protocol = "http:";
      url.port = "8091";
      return url.toString().replace(/\/$/, "");
    } catch {
      return null;
    }
  };
  const fallbackControlUrl =
    engineControlUrl === engineUrl
      ? getLocalCompanionControlUrl(engineControlUrl)
      : null;
  const healthUrls = [
    engineControlUrl,
    engineUrl,
    fallbackControlUrl,
  ].filter((entry, index, entries) => entry && entries.indexOf(entry) === index);
  const healthAttempts = [];
  const getEngineHealth = async () => {
    for (const healthUrl of healthUrls) {
      const response = await request("engine health", `${healthUrl}/health`, {
        cache: "no-store",
        headers: engineHeaders,
      }).catch((error) => {
        healthAttempts.push({
          error: error instanceof Error ? error.message : String(error),
          url: healthUrl,
        });
        return null;
      });
      if (!response) continue;
      const health = await response.json().catch((error) => {
        healthAttempts.push({
          error: error instanceof Error ? error.message : String(error),
          status: response.status,
          url: healthUrl,
        });
        return null;
      });
      healthAttempts.push({
        ok: response.ok,
        runtimeKind: health?.runtimeKind || "",
        status: response.status,
        url: healthUrl,
      });
      if (response.ok && health) return health;
    }
    return null;
  };
  const postEngineControl = async (path, body) => {
    const sendControl = (controlUrl) =>
      request("engine control", `${controlUrl}${path}`, {
        body: body ? JSON.stringify(body) : undefined,
        cache: "no-store",
        headers: {
          ...engineHeaders,
          ...(body ? { "content-type": "application/json" } : {}),
        },
        method: "POST",
      });
    let response = await sendControl(engineControlUrl).catch((error) => {
      if (!fallbackControlUrl) throw error;
      return sendControl(fallbackControlUrl);
    });
    if (
      fallbackControlUrl &&
      engineControlUrl !== fallbackControlUrl &&
      [404, 405].includes(response.status)
    ) {
      response = await sendControl(fallbackControlUrl);
    }
    return response;
  };

  const createResponse = await request("native session creation", `${apiBaseUrl}/sessions`, {
    body: JSON.stringify({
      clientSessionId: sessionId,
      gameId,
      mode: "cloud",
    }),
    headers: {
      authorization: `Bearer ${authToken}`,
      "content-type": "application/json",
    },
    method: "POST",
  });
  const created = await createResponse.json().catch(() => null);
  if (!createResponse.ok) {
    return {
      created,
      error: `session create returned ${createResponse.status}`,
    };
  }
  if (typeof created?.sessionToken !== "string" || created?.boot?.runtimeKind !== "native_linux") {
    return { error: "session create returned invalid native boot credentials" };
  }
  const verifyResponse = await request(
    "native session verification",
    `${apiBaseUrl}/sessions/${sessionId}/verify`,
    {
      body: JSON.stringify({ sessionToken: created.sessionToken }),
      headers: { "content-type": "application/json" },
      method: "POST",
    },
  );
  const verified = await verifyResponse.json().catch(() => null);
  if (!verifyResponse.ok) {
    return {
      created,
      error: `session verify returned ${verifyResponse.status}`,
      verified,
    };
  }

  const beforeHealth = await getEngineHealth();
  if (created.boot?.runtimeKind !== beforeHealth?.runtimeKind) {
    const stopResponse = await postEngineControl("/session/stop-active");
    if (!stopResponse.ok) return { error: `stop active session returned ${stopResponse.status}` };
    const switchResponse = await postEngineControl("/runtime/switch", {
      runtimeKind: created.boot?.runtimeKind,
    });
    const switchPayload = await switchResponse.json().catch(() => null);
    if (![200, 202].includes(switchResponse.status)) {
      return {
        beforeHealth,
        created,
        error: `runtime switch returned ${switchResponse.status}`,
        switchPayload,
      };
    }
  }

  let activeHealth = null;
  let activeRuntimeKind = "";
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const health = await getEngineHealth();
    activeHealth = health;
    activeRuntimeKind = health?.runtimeKind || "";
    if (activeRuntimeKind === created.boot?.runtimeKind) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return {
    activeHealth,
    activeRuntimeKind,
    healthAttempts: healthAttempts.slice(-20),
    bootTarget:
      created.boot?.launchManifestId ||
      created.boot?.romUrl ||
      created.boot?.romFilename ||
      null,
    created,
    verified,
  };
}
