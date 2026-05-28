import type { Socket } from "socket.io";
import { getSessionRoom, normalizeSessionId } from "./sessionRooms";

type EngineErrorPayload = {
  message?: unknown;
  sessionId?: unknown;
  source?: unknown;
};

export function registerEngineErrorHandlers(socket: Socket) {
  socket.on("engine-error", (payload: EngineErrorPayload = {}) => {
    const sessionId =
      normalizeSessionId(payload.sessionId) || socket.data.sessionId;
    const message =
      typeof payload.message === "string"
        ? payload.message
        : "Engine stream error";

    if (!sessionId) {
      console.warn("[Node.js] Dropping engine-error: missing session id");
      return;
    }

    console.warn(`[Engine] Session ${sessionId} error: ${message}`);
    socket.to(getSessionRoom(sessionId)).emit("engine-error", {
      message,
      sessionId,
      source: typeof payload.source === "string" ? payload.source : "engine",
    });
  });
}
