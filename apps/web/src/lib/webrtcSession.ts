import { api, getAuthSession } from "./apiClient";

export type WebRTCStatus = "idle" | "connecting" | "playing" | "error";

export const createWebRTCSessionId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

export const resolveGameBootTarget = async (
  gameId: string,
  clientSessionId: string,
) => {
  const session = await getAuthSession();
  const userId = session?.user?.id || "anonymous";

  if (gameId.toLowerCase().endsWith(".nes")) {
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
