import { isSocketPayload } from "./socketPayload";
import type { Socket } from "socket.io";
import { getSessionRoom, normalizeSessionId } from "./sessionRooms";
import { getPeerId } from "./signalingPayloads";
import { getPeerRoom } from "./signalingRelay";

type EngineErrorPayload = {
  message?: unknown;
  sessionId?: unknown;
  peerId?: unknown;
};

export function registerEngineErrorHandlers(socket: Socket) {
  socket.on("engine-error", (payload: EngineErrorPayload = {}) => {
    if (!isSocketPayload(payload) || socket.data.trustedCamera !== true) return;
    const sessionId = normalizeSessionId(socket.data.sessionId);
    if (!sessionId || ("sessionId" in payload && payload.sessionId !== sessionId)) return;
    const peerId = getPeerId(payload);
    // An invalid explicit scope must never fall back to the entire session.
    if ("peerId" in payload && !peerId) return;
    const message = typeof payload.message === "string" && payload.message.length > 0
      ? payload.message.slice(0, 2048) : "Engine stream error";
    console.warn(`[Engine] Session ${sessionId} error: ${message}`);
    socket.to(peerId ? getPeerRoom(sessionId, peerId) : getSessionRoom(sessionId)).emit("engine-error", {
      message, sessionId, source: "camera", ...(peerId ? { peerId } : {}),
    });
  });
}
