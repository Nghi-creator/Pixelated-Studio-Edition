import { api, getAuthSession } from "../api/apiClient";
export { createWebRTCSessionId } from "./webrtcIdentity";

export type WebRTCStatus = "idle" | "connecting" | "playing" | "error";

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
