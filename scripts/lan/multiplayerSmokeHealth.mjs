export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function nowIso() {
  return new Date().toISOString();
}

export function printCheck(status, label, detail = "") {
  const suffix = detail ? ` - ${detail}` : "";
  console.log(`[${status}] ${label}${suffix}`);
}

export function getHealthUrl(engineUrl) {
  return `${engineUrl}/health`;
}

export function isHttpsCompanion(engineUrl) {
  return new URL(engineUrl).protocol === "https:";
}

export function normalizeInviteCode(inviteCode) {
  return inviteCode.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function getRuntimeActiveSessionId(health) {
  return health?.checks?.runtime?.activeSessionId || null;
}

export function getCameraPeerState(health) {
  const peers = health?.checks?.resources?.cameraPeers || {};
  const peerIds = Array.isArray(peers.peerIds)
    ? peers.peerIds.filter((peerId) => typeof peerId === "string")
    : [];

  return {
    peerCount: Number(peers.peerCount) || 0,
    peerIds,
    sessionId: typeof peers.sessionId === "string" ? peers.sessionId : null,
  };
}

export function getInputMode(health) {
  const bridge = health?.checks?.gamepadBridge || {};
  const hasVirtualGamepads =
    bridge.fileExists === true &&
    bridge.uinputAvailable === true &&
    bridge.failed !== true;

  return {
    bridgeFailed: bridge.failed === true,
    bridgeFileExists: bridge.fileExists === true,
    mode: hasVirtualGamepads ? "virtual-gamepads" : "keyboard-fallback",
    supportedPlayers: hasVirtualGamepads ? 4 : 2,
    uinputAvailable: bridge.uinputAvailable === true,
  };
}

export function summarizeProcess(processSnapshot) {
  if (!processSnapshot || typeof processSnapshot !== "object") {
    return null;
  }

  return {
    averageCpuPercent:
      typeof processSnapshot.averageCpuPercent === "number"
        ? processSnapshot.averageCpuPercent
        : null,
    pid: typeof processSnapshot.pid === "number" ? processSnapshot.pid : null,
    rssMb:
      typeof processSnapshot.rssMb === "number" ? processSnapshot.rssMb : null,
  };
}

export function getResourceSnapshot(health) {
  const resources = health?.checks?.resources || {};

  return {
    camera: summarizeProcess(resources.camera),
    node: summarizeProcess(resources.node),
    retroarch: summarizeProcess(resources.retroarch),
  };
}

export function summarizeHealth(health) {
  const cameraPeers = getCameraPeerState(health);
  const runtimeActiveSessionId = getRuntimeActiveSessionId(health);

  return {
    cameraPeers,
    input: getInputMode(health),
    ok: Boolean(health?.ok),
    resources: getResourceSnapshot(health),
    runtimeActiveSessionId,
    runtimeCameraRunning: Boolean(health?.checks?.runtime?.cameraRunning),
    runtimeRetroarchRunning: Boolean(health?.checks?.runtime?.retroarchRunning),
    uptime: typeof health?.uptime === "number" ? health.uptime : null,
  };
}

export async function fetchHealth(engineUrl) {
  const response = await fetch(getHealthUrl(engineUrl));
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const message = body ? JSON.stringify(body) : response.statusText;
    throw new Error(`GET /health returned ${response.status}: ${message}`);
  }

  return body;
}

export async function requestJson(engineUrl, route, options = {}) {
  const response = await fetch(`${engineUrl}${route}`, options);
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const message = body ? JSON.stringify(body) : response.statusText;
    throw new Error(
      `${options.method || "GET"} ${route} returned ${response.status}: ${message}`,
    );
  }

  return body;
}

export async function preflightCompanion(engineUrl) {
  const preflight = await requestJson(engineUrl, "/invite/preflight");
  if (preflight?.certificate?.status !== "accepted") {
    throw new Error("Companion preflight did not confirm certificate acceptance.");
  }
  if (preflight?.invite?.status !== "active") {
    throw new Error(
      `Companion invite is ${preflight?.invite?.status || "unknown"}, expected active.`,
    );
  }
  if (preflight?.engine?.status !== "available" || preflight?.ready !== true) {
    throw new Error("Companion preflight reports that the host engine is unavailable.");
  }
  return preflight;
}

export async function redeemCompanionInvite(engineUrl, inviteCode) {
  const normalizedInviteCode = normalizeInviteCode(inviteCode);
  if (!normalizedInviteCode) {
    throw new Error("--invite-code must contain letters or numbers.");
  }

  const redemption = await requestJson(engineUrl, "/invite/redeem", {
    body: JSON.stringify({ code: normalizedInviteCode }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  if (!redemption?.companionToken) {
    throw new Error("Companion invite redemption returned no companion credential.");
  }
  return redemption;
}


