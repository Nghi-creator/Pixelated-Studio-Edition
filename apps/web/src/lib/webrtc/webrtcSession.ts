import { api, getAuthSession } from "../api/apiClient";
export { createWebRTCSessionId } from "./webrtcIdentity";

export type WebRTCStatus = "idle" | "connecting" | "playing" | "error";

const LOCAL_VAULT_EXTENSIONS = [".nes", ".gb", ".gbc", ".gba"];

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
  const romFilename =
    backendSession.boot.romUrl || backendSession.boot.romFilename;
  if (!romFilename) throw new Error("Game has no ROM target");

  console.log(`[WebRTC] Cloud Game found. Sending boot string: ${romFilename}`);

  return {
    mode: "cloud",
    romFilename,
    sessionId: backendSession.sessionId,
    sessionToken: backendSession.sessionToken,
    userId: backendSession.user.id,
  };
};
