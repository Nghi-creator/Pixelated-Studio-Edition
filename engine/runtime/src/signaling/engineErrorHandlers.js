const {
  getSessionRoom,
  normalizeSessionId,
} = require("./sessionRooms");

function registerEngineErrorHandlers(socket) {
  socket.on("engine-error", (payload = {}) => {
    const sessionId =
      normalizeSessionId(payload.sessionId) || socket.data.sessionId;
    const message = payload.message || "Engine stream error";

    if (!sessionId) {
      console.warn("[Node.js] Dropping engine-error: missing session id");
      return;
    }

    console.warn(`[Engine] Session ${sessionId} error: ${message}`);
    socket.to(getSessionRoom(sessionId)).emit("engine-error", {
      sessionId,
      message,
      source: payload.source || "engine",
    });
  });
}

module.exports = { registerEngineErrorHandlers };
