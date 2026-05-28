import type { Socket } from "socket.io";
import {
  getSessionRoom,
  joinSession,
  normalizeSessionId,
  relayToSession,
} from "./sessionRooms";

type SessionPayload = {
  peerId?: unknown;
  sessionId?: unknown;
};

type CandidateEnvelope = {
  candidate?: SessionPayload;
  peerId?: unknown;
  sessionId?: unknown;
};

function stripSessionId(payload: unknown) {
  if (!payload || typeof payload !== "object") return {};
  const { sessionId: _sessionId, ...rest } = payload as Record<string, unknown>;
  return rest;
}

function unwrapCandidate(payload: CandidateEnvelope | SessionPayload) {
  if (!("candidate" in payload) || !payload.candidate) return payload;

  return {
    ...payload.candidate,
    peerId: payload.peerId,
    sessionId: payload.sessionId,
  };
}

function getPeerId(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const peerId = (payload as { peerId?: unknown }).peerId;
  return typeof peerId === "string" && /^[a-zA-Z0-9_-]+$/.test(peerId)
    ? peerId
    : null;
}

function getPeerRoom(peerId: string) {
  return `peer:${peerId}`;
}

function rememberPeer(socket: Socket, peerId: string) {
  const peerIds = Array.isArray(socket.data.webrtcPeerIds)
    ? socket.data.webrtcPeerIds
    : [];

  if (!peerIds.includes(peerId)) {
    socket.data.webrtcPeerIds = [...peerIds, peerId];
  }
}

function emitPeerDisconnect(socket: Socket, peerId: string) {
  const sessionId = normalizeSessionId(socket.data.sessionId);
  if (!sessionId) return;

  socket.to(getSessionRoom(sessionId)).emit("webrtc-peer-disconnect", {
    peerId,
    sessionId,
  });
}

function relayToPeerOrSession(
  socket: Socket,
  eventName: string,
  payload?: unknown,
) {
  const peerId = getPeerId(payload);
  if (peerId) {
    socket.to(getPeerRoom(peerId)).emit(eventName, stripSessionId(payload));
    return;
  }

  relayToSession(socket, eventName, stripSessionId(payload));
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
    const peerId = getPeerId(offer);
    if (peerId) {
      socket.join(getPeerRoom(peerId));
      rememberPeer(socket, peerId);
    }
    relayToSession(socket, "webrtc-offer", stripSessionId(offer));
  });

  socket.on("webrtc-peer-disconnect", (payload: SessionPayload = {}) => {
    const peerId = getPeerId(payload);
    if (peerId) emitPeerDisconnect(socket, peerId);
  });

  socket.on("webrtc-answer", (answer: SessionPayload = {}) => {
    relayToPeerOrSession(socket, "webrtc-answer", answer);
  });

  socket.on("webrtc-ice-candidate", (payload: CandidateEnvelope = {}) => {
    relayToSession(socket, "webrtc-ice-candidate", unwrapCandidate(payload));
  });

  socket.on(
    "webrtc-ice-candidate-backend",
    (payload: CandidateEnvelope = {}) => {
      relayToPeerOrSession(
        socket,
        "webrtc-ice-candidate-backend",
        unwrapCandidate(payload),
      );
    },
  );

  socket.on("disconnect", () => {
    const peerIds = Array.isArray(socket.data.webrtcPeerIds)
      ? socket.data.webrtcPeerIds
      : [];

    for (const peerId of peerIds) {
      if (typeof peerId === "string") emitPeerDisconnect(socket, peerId);
    }
  });
}
