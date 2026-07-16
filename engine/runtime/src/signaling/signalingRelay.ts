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

const MAX_PEER_ID_LENGTH = 128;
const MAX_PEERS_PER_SOCKET = 32;

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
  return typeof peerId === "string" &&
    peerId.length > 0 &&
    peerId.length <= MAX_PEER_ID_LENGTH &&
    /^[a-zA-Z0-9_-]+$/.test(peerId)
    ? peerId
    : null;
}

function getPeerRoom(peerId: string) {
  return `peer:${peerId}`;
}

function rememberPeer(socket: Socket, peerId: string) {
  const peerIds: string[] = Array.isArray(socket.data.webrtcPeerIds)
    ? socket.data.webrtcPeerIds.filter(
        (value: unknown): value is string => typeof value === "string",
      )
    : [];

  if (peerIds.includes(peerId)) return true;
  if (peerIds.length >= MAX_PEERS_PER_SOCKET) return false;
  socket.data.webrtcPeerIds = [...peerIds, peerId];
  return true;
}

function forgetPeer(socket: Socket, peerId: string) {
  const peerIds: string[] = Array.isArray(socket.data.webrtcPeerIds)
    ? socket.data.webrtcPeerIds.filter(
        (value: unknown): value is string => typeof value === "string",
      )
    : [];
  if (!peerIds.includes(peerId)) return;

  socket.data.webrtcPeerIds = peerIds.filter((value) => value !== peerId);
  void socket.leave(getPeerRoom(peerId));
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
  const hasPeerId =
    payload !== null && typeof payload === "object" && "peerId" in payload;
  if (peerId) {
    socket.to(getPeerRoom(peerId)).emit(eventName, stripSessionId(payload));
    return;
  }
  if (hasPeerId) return;

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
    if (!peerId || !rememberPeer(socket, peerId)) return;
    socket.join(getPeerRoom(peerId));
    relayToSession(socket, "webrtc-offer", stripSessionId(offer));
  });

  socket.on("webrtc-peer-disconnect", (payload: SessionPayload = {}) => {
    const peerId = getPeerId(payload);
    if (peerId) {
      emitPeerDisconnect(socket, peerId);
      forgetPeer(socket, peerId);
    }
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
