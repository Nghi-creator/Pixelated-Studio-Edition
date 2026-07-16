import type { Socket } from "socket.io";

export function normalizeSessionId(sessionId: unknown) {
  return typeof sessionId === "string" &&
    sessionId.length > 0 &&
    sessionId.length <= 128 &&
    /^[a-zA-Z0-9_-]+$/.test(sessionId)
    ? sessionId
    : null;
}

export function getSessionRoom(sessionId: string) {
  return `session:${sessionId}`;
}

export function joinSession(
  socket: Socket,
  sessionId: unknown,
  role = "unknown",
) {
  const safeSessionId = normalizeSessionId(sessionId);

  if (!safeSessionId) {
    console.warn(`[Node.js] Refusing invalid session id from ${socket.id}`);
    return null;
  }

  socket.data.sessionId = safeSessionId;
  socket.join(getSessionRoom(safeSessionId));
  console.log(
    `[Node.js] ${role} socket ${socket.id} joined session ${safeSessionId}`,
  );

  return safeSessionId;
}

export function relayToSession(
  socket: Socket,
  eventName: string,
  payload?: unknown,
) {
  const sessionPayload =
    payload && typeof payload === "object"
      ? (payload as { sessionId?: unknown })
      : {};
  const sessionId =
    normalizeSessionId(sessionPayload.sessionId) || socket.data.sessionId;

  if (!sessionId) {
    console.warn(`[Node.js] Dropping ${eventName}: missing session id`);
    return;
  }

  socket.to(getSessionRoom(sessionId)).emit(eventName, payload);
}
