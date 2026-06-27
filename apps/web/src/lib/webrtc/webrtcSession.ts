import { api, getAuthSession } from "../api/apiClient";
import {
  loadEngineRuntimeKind,
  requestEngineRuntimeSwitch,
} from "./engineContext";
import { assertEngineRuntimeKindMatches } from "./runtimeKind";
export { createWebRTCSessionId } from "./webrtcIdentity";

export type WebRTCStatus = "idle" | "connecting" | "playing" | "error";

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
  const activeRuntimeKind = await loadEngineRuntimeKind();
  if (requiredRuntimeKind !== activeRuntimeKind) {
    const switchResult = await requestEngineRuntimeSwitch(requiredRuntimeKind).catch(
      () => ({ status: "unavailable" as const }),
    );
    if (switchResult.status === "blocked") {
      throw new Error(switchResult.error);
    }
    if (switchResult.status === "restarting") {
      throw new Error(
        requiredRuntimeKind === "native_linux"
          ? "Pixelated Desktop is switching to the native Linux engine. Wait for the desktop engine to show ready, then press Play again."
          : "Pixelated Desktop is switching to the libretro engine. Wait for the desktop engine to show ready, then press Play again.",
      );
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
