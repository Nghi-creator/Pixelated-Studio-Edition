import type { Socket } from "socket.io";
import {
  getSessionRoom,
  joinSession,
  normalizeSessionId,
  relayToSession,
} from "./sessionRooms";

type SessionPayload = {
  sessionId?: unknown;
};

type CandidateEnvelope = {
  candidate?: SessionPayload;
};

function stripSessionId(payload: unknown) {
  if (!payload || typeof payload !== "object") return {};
  const { sessionId: _sessionId, ...rest } = payload as Record<string, unknown>;
  return rest;
}

function unwrapCandidate(payload: CandidateEnvelope | SessionPayload) {
  return "candidate" in payload && payload.candidate
    ? payload.candidate
    : payload;
}

export function registerSignalingRelayHandlers(socket: Socket) {
  socket.on("python-ready", (payload: SessionPayload = {}) => {
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

  socket.on("webrtc-offer", (offer: SessionPayload = {}) => {
    relayToSession(socket, "webrtc-offer", stripSessionId(offer));
  });

  socket.on("webrtc-answer", (answer: SessionPayload = {}) => {
    relayToSession(socket, "webrtc-answer", stripSessionId(answer));
  });

  socket.on("webrtc-ice-candidate", (payload: CandidateEnvelope = {}) => {
    relayToSession(socket, "webrtc-ice-candidate", unwrapCandidate(payload));
  });

  socket.on(
    "webrtc-ice-candidate-backend",
    (payload: CandidateEnvelope = {}) => {
      relayToSession(
        socket,
        "webrtc-ice-candidate-backend",
        unwrapCandidate(payload),
      );
    },
  );
}
