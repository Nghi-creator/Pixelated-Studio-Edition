import { api } from "./apiClient";
import { supabase } from "./supabaseClient";

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
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const userId = session?.user?.id || "anonymous";

  if (gameId.toLowerCase().endsWith(".nes")) {
    console.log(
      `[WebRTC] Local Vault game detected. Booting directly: ${gameId} for user ${userId}`,
    );
    return { romFilename: gameId, userId };
  }

  const backendSession = await api.createSession(gameId, clientSessionId);
  const romFilename =
    backendSession.boot.romUrl || backendSession.boot.romFilename;
  if (!romFilename) throw new Error("Game has no ROM target");

  console.log(`[WebRTC] Cloud Game found. Sending boot string: ${romFilename}`);

  return {
    romFilename,
    sessionId: backendSession.sessionId,
    sessionToken: backendSession.sessionToken,
    userId: backendSession.user.id,
  };
};
