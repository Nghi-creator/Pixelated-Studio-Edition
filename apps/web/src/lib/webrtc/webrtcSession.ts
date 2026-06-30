import { api, getAuthSession } from "../api/apiClient";
import {
  loadEngineRuntimeKind,
  requestEngineRuntimeSwitch,
  stopActiveEngineSession,
} from "./engineContext";
import { assertEngineRuntimeKindMatches } from "./runtimeKind";
export { createWebRTCSessionId } from "./webrtcIdentity";

export type WebRTCStatus = "idle" | "connecting" | "playing" | "error";

const RUNTIME_SWITCH_WAIT_MS = 120_000;
const RUNTIME_SWITCH_POLL_MS = 1_000;

const LOCAL_VAULT_EXTENSIONS = [
  ".nes",
  ".gb",
  ".gbc",
  ".gba",
  ".sfc",
  ".smc",
  ".md",
  ".gen",
  ".sms",
  ".gg",
];

function isLocalVaultGameId(gameId: string) {
  const lowerGameId = gameId.toLowerCase();
  return LOCAL_VAULT_EXTENSIONS.some((extension) =>
    lowerGameId.endsWith(extension),
  );
}

async function waitForEngineRuntimeKind(requiredRuntimeKind: string) {
  const deadline = Date.now() + RUNTIME_SWITCH_WAIT_MS;
  let lastError: unknown = null;

  while (Date.now() < deadline) {
    try {
      const activeRuntimeKind = await loadEngineRuntimeKind();
      if (activeRuntimeKind === requiredRuntimeKind) return activeRuntimeKind;
    } catch (err) {
      lastError = err;
    }

    await new Promise((resolve) => setTimeout(resolve, RUNTIME_SWITCH_POLL_MS));
  }

  console.warn("[WebRTC] Runtime switch wait timed out:", lastError);
  throw new Error(
    requiredRuntimeKind === "native_linux"
      ? "Pixelated Desktop is still switching to the native Linux engine. Wait for the desktop engine to show ready, then press Play again."
      : "Pixelated Desktop is still switching to the libretro engine. Wait for the desktop engine to show ready, then press Play again.",
  );
}

export const resolveGameBootTarget = async (
  gameId: string,
  clientSessionId: string,
) => {
  const session = await getAuthSession();
  const userId = session?.user?.id || "anonymous";

  if (isLocalVaultGameId(gameId)) {
    console.log(
      `[WebRTC] Local Vault game detected. Booting directly: ${gameId} for user ${userId}`,
    );
    return { mode: "local", romFilename: gameId, userId };
  }

  const backendSession = await api.createSession(gameId, clientSessionId);
  const requiredRuntimeKind = backendSession.boot.runtimeKind || "libretro";
  let activeRuntimeKind = await loadEngineRuntimeKind();
  if (requiredRuntimeKind !== activeRuntimeKind) {
    await stopActiveEngineSession().catch((err) => {
      console.warn("[WebRTC] Could not pre-stop active session:", err);
    });
    const switchResult = await requestEngineRuntimeSwitch(requiredRuntimeKind).catch(
      () => ({
        error:
          "Pixelated Desktop could not switch runtimes automatically. Open the app from Pixelated Desktop or pair this browser with the local engine, then try again.",
        status: "unavailable" as const,
      }),
    );
    if (switchResult.status === "blocked") {
      throw new Error(switchResult.error);
    }
    if (switchResult.status === "unavailable") {
      throw new Error(switchResult.error);
    }
    if (switchResult.status === "restarting") {
      activeRuntimeKind = await waitForEngineRuntimeKind(requiredRuntimeKind);
    } else {
      activeRuntimeKind = await loadEngineRuntimeKind();
    }
  }
  assertEngineRuntimeKindMatches(requiredRuntimeKind, activeRuntimeKind);
  const romFilename = backendSession.boot.launchManifestId
    ? backendSession.boot.launchManifestId
    : backendSession.boot.romUrl || backendSession.boot.romFilename;
  if (!romFilename) throw new Error("Game has no boot target");

  console.log(`[WebRTC] Cloud Game found. Sending boot string: ${romFilename}`);

  return {
    mode: "cloud",
    romFilename,
    sessionId: backendSession.sessionId,
    sessionToken: backendSession.sessionToken,
    userId: backendSession.user.id,
  };
};
