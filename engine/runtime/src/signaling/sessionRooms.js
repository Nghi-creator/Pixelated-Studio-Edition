function normalizeSessionId(sessionId) {
  return typeof sessionId === "string" && /^[a-zA-Z0-9_-]+$/.test(sessionId)
    ? sessionId
    : null;
}

function getSessionRoom(sessionId) {
  return `session:${sessionId}`;
}

function joinSession(socket, sessionId, role = "unknown") {
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

function relayToSession(socket, eventName, payload) {
  const sessionId =
    normalizeSessionId(payload?.sessionId) || socket.data.sessionId;

  if (!sessionId) {
    console.warn(`[Node.js] Dropping ${eventName}: missing session id`);
    return;
  }

  socket.to(getSessionRoom(sessionId)).emit(eventName, payload);
}

module.exports = {
  getSessionRoom,
  joinSession,
  normalizeSessionId,
  relayToSession,
};
