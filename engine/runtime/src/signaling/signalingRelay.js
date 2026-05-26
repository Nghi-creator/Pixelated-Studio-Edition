const {
  getSessionRoom,
  joinSession,
  normalizeSessionId,
  relayToSession,
} = require("./sessionRooms");

function registerSignalingRelayHandlers(socket) {
  socket.on("python-ready", (payload = {}) => {
    const sessionId =
      normalizeSessionId(payload.sessionId) || socket.data.sessionId;

    if (!sessionId) {
      console.warn("[Node.js] Dropping python-ready: missing session id");
      return;
    }

    joinSession(socket, sessionId, "camera");
    console.log(
      `[Node.js] Python Camera is armed for session ${sessionId}! Relaying to React...`,
    );
    socket.to(getSessionRoom(sessionId)).emit("python-ready", { sessionId });
  });

  socket.on("webrtc-offer", (offer = {}) => {
    const { sessionId: _sessionId, ...offerPayload } = offer;
    relayToSession(socket, "webrtc-offer", offerPayload);
  });

  socket.on("webrtc-answer", (answer = {}) => {
    const { sessionId: _sessionId, ...answerPayload } = answer;
    relayToSession(socket, "webrtc-answer", answerPayload);
  });

  socket.on("webrtc-ice-candidate", (payload) => {
    const candidate = payload?.candidate || payload;
    relayToSession(socket, "webrtc-ice-candidate", candidate);
  });

  socket.on("webrtc-ice-candidate-backend", (payload) => {
    const candidate = payload?.candidate || payload;
    relayToSession(socket, "webrtc-ice-candidate-backend", candidate);
  });
}

module.exports = { registerSignalingRelayHandlers };
