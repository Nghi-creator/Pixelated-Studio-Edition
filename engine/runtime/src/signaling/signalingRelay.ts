import { createHash } from "node:crypto";
import { receiverChallenge, receiverObservation } from "./receiverObservations";
import { isSocketPayload } from "./socketPayload";
import type { Socket } from "socket.io";
import {
  getSessionRoom,
  joinSession,
  normalizeSessionId,
  onSessionChange,
  relayToSession,
} from "./sessionRooms";
import {
  getPeerId,
  isValidWebRtcAnswer,
  isValidWebRtcOffer,
  normalizeIceCandidate,
  type CandidateEnvelope,
  type SessionPayload,
} from "./signalingPayloads";

export {
  isValidWebRtcAnswer,
  isValidWebRtcOffer,
  normalizeIceCandidate,
} from "./signalingPayloads";

const MAX_PEERS_PER_SOCKET = 1;
const DEFAULT_MAX_ACTIVE_PEERS = 8;
const DEFAULT_SIGNALING_EVENTS_PER_SECOND = 120;

export type SignalingPeerRegistry = ReturnType<
  typeof createSignalingPeerRegistry
>;

type SignalingRelayOptions = {
  canCreatePeer?: (socket: Socket, sessionId: string) => boolean;
  eventLimitPerSecond?: number;
  now?: () => number;
  peerRegistry?: SignalingPeerRegistry;
};

export function createSignalingPeerRegistry(
  maxActivePeers = DEFAULT_MAX_ACTIVE_PEERS,
) {
  if (!Number.isInteger(maxActivePeers) || maxActivePeers <= 0) {
    throw new Error("Maximum active WebRTC peers must be a positive integer");
  }

  const peers = new Map<
    string,
    { peerId: string; sessionId: string; socketId: string; offerHash: string | null;
      receiver?: { bindingId: string; cameraId: string; sequence: number; clockId: string | null; elapsedNs: number; decoded: number; presented: number; receivedAt: number } }
  >();

  const peerKey = (sessionId: string, peerId: string) =>
    `${sessionId}:${peerId}`;

  function releaseSocket(socketId: string) {
    for (const [key, peer] of peers) {
      if (peer.socketId === socketId) peers.delete(key);
    }
  }

  return {
    acquire(sessionId: string, peerId: string, socketId: string, offerHash?: string) {
      const key = peerKey(sessionId, peerId);
      const existing = peers.get(key);
      if (existing) {
        if (existing.socketId !== socketId) return false;
        if (offerHash && offerHash !== existing.offerHash) {
          existing.offerHash = offerHash;
          existing.receiver = undefined;
        }
        return true;
      }

      releaseSocket(socketId);
      if (peers.size >= maxActivePeers) return false;
      peers.set(key, { peerId, sessionId, socketId, offerHash: offerHash || null });
      return true;
    },
    release(sessionId: string, peerId: string, socketId: string) {
      const key = peerKey(sessionId, peerId);
      if (peers.get(key)?.socketId === socketId) peers.delete(key);
    },
    owns(sessionId: string, peerId: string, socketId: string) {
      return peers.get(peerKey(sessionId, peerId))?.socketId === socketId;
    },
    bindReceiver(sessionId: string, peerId: string, bindingId: string, offerHash: string, cameraId: string) {
      const peer = peers.get(peerKey(sessionId, peerId));
      if (!peer || peer.offerHash !== offerHash || peer.socketId === cameraId) return null;
      if (peer.receiver?.bindingId === bindingId) {
        return peer.receiver.cameraId === cameraId ? peer.socketId : null;
      }
      peer.receiver = { bindingId, cameraId, sequence: -1, clockId: null, elapsedNs: -1, decoded: 0, presented: 0, receivedAt: -Infinity };
      return peer.socketId;
    },
    observeReceiver(sessionId: string, socketId: string, sample: NonNullable<ReturnType<typeof receiverObservation>>, stamp: number) {
      const peer = peers.get(peerKey(sessionId, sample.peerId));
      const receiver = peer?.receiver;
      if (!peer || peer.socketId !== socketId || !receiver || receiver.bindingId !== sample.bindingId) return null;
      if (stamp < receiver.receivedAt || sample.sequence !== receiver.sequence + 1 ||
          (receiver.clockId !== null && receiver.clockId !== sample.clockId) ||
          sample.elapsedNs <= receiver.elapsedNs || sample.framesDecoded < receiver.decoded || sample.presentedFrames < receiver.presented) {
        peer.receiver = undefined;
        return null;
      }
      // Bound forwarding rate before advancing sequence, so floods cannot silently
      // skip samples and resume a supposedly continuous observation stream.
      if (stamp - receiver.receivedAt < 100) { peer.receiver = undefined; return null; }
      receiver.sequence = sample.sequence;
      receiver.clockId = sample.clockId;
      receiver.elapsedNs = sample.elapsedNs;
      receiver.decoded = sample.framesDecoded;
      receiver.presented = sample.presentedFrames;
      receiver.receivedAt = stamp;
      return { cameraId: receiver.cameraId, offerHash: peer.offerHash! };
    },
    invalidateReceiver(sessionId: string, peerId: string, socketId: string) {
      const peer = peers.get(peerKey(sessionId, peerId));
      if (peer?.socketId === socketId) peer.receiver = undefined;
    },
    dropReceiverCamera(cameraId: string) {
      const dropped: Array<{ socketId: string; peerId: string; bindingId: string }> = [];
      for (const peer of peers.values()) {
        if (peer.receiver?.cameraId === cameraId) {
          dropped.push({ socketId: peer.socketId, peerId: peer.peerId, bindingId: peer.receiver.bindingId });
          peer.receiver = undefined;
        }
      }
      return dropped;
    },
    releaseSocket,
    size: () => peers.size,
  };
}

function stripSessionId(payload: unknown) {
  if (!payload || typeof payload !== "object") return {};
  const { sessionId: _sessionId, ...rest } = payload as Record<string, unknown>;
  return rest;
}

function payloadMatchesActiveSession(socket: Socket, payload: SessionPayload) {
  const activeSessionId = normalizeSessionId(socket.data.sessionId);
  const requestedSessionId = normalizeSessionId(payload.sessionId);
  return Boolean(
    activeSessionId &&
      (!requestedSessionId || requestedSessionId === activeSessionId),
  );
}

function getPeerRoom(sessionId: string, peerId: string) {
  return `session:${sessionId}:peer:${peerId}`;
}

function rememberPeer(socket: Socket, peerId: string) {
  const sessionId = normalizeSessionId(socket.data.sessionId);
  if (!sessionId) return false;
  const peerIds: string[] = Array.isArray(socket.data.webrtcPeerIds)
    ? socket.data.webrtcPeerIds.filter(
        (value: unknown): value is string => typeof value === "string",
      )
    : [];

  if (peerIds.includes(peerId)) return true;
  if (peerIds.length >= MAX_PEERS_PER_SOCKET) return false;
  socket.data.webrtcPeerIds = [...peerIds, peerId];
  void socket.join(getPeerRoom(sessionId, peerId));
  return true;
}

function forgetPeer(socket: Socket, peerId: string) {
  const sessionId = normalizeSessionId(socket.data.sessionId);
  const peerIds: string[] = Array.isArray(socket.data.webrtcPeerIds)
    ? socket.data.webrtcPeerIds.filter(
        (value: unknown): value is string => typeof value === "string",
      )
    : [];
  if (!peerIds.includes(peerId)) return;

  socket.data.webrtcPeerIds = peerIds.filter((value) => value !== peerId);
  if (sessionId) void socket.leave(getPeerRoom(sessionId, peerId));
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
  const sessionId = normalizeSessionId(socket.data.sessionId);
  const requestedSessionId =
    payload && typeof payload === "object"
      ? normalizeSessionId((payload as SessionPayload).sessionId)
      : null;
  if (!sessionId || (requestedSessionId && requestedSessionId !== sessionId)) {
    return;
  }

  const peerId = getPeerId(payload);
  const hasPeerId =
    payload !== null && typeof payload === "object" && "peerId" in payload;
  if (peerId) {
    socket
      .to(getPeerRoom(sessionId, peerId))
      .emit(eventName, stripSessionId(payload));
    return;
  }
  if (hasPeerId) return;

  relayToSession(socket, eventName, stripSessionId(payload));
}

export function registerSignalingRelayHandlers(
  socket: Socket,
  options: SignalingRelayOptions = {},
) {
  const eventLimit =
    options.eventLimitPerSecond || DEFAULT_SIGNALING_EVENTS_PER_SECOND;
  const canCreatePeer = options.canCreatePeer || (() => true);
  const peerRegistry =
    options.peerRegistry || createSignalingPeerRegistry();
  const now = options.now || Date.now;
  let eventCount = 0;
  let eventWindowStartedAt = now();
  let warningSent = false;

  const consumeSignalingBudget = () => {
    const currentTime = now();
    if (currentTime - eventWindowStartedAt >= 1_000) {
      eventCount = 0;
      eventWindowStartedAt = currentTime;
      warningSent = false;
    }

    eventCount += 1;
    if (eventCount <= eventLimit) return true;
    if (!warningSent) {
      warningSent = true;
      socket.emit("engine-error", {
        code: "engine_signaling_rate_limited",
        message: "WebRTC signaling rate limit reached.",
      });
    }
    return false;
  };

  socket.on("python-ready", (payload: SessionPayload = {}) => {
    if (!isSocketPayload(payload)) return;
    if (!consumeSignalingBudget()) return;
    if (socket.data.trustedCamera !== true) {
      console.warn("[Node.js] Dropping python-ready from an untrusted socket");
      return;
    }

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
    if (!isSocketPayload(offer)) return;
    if (!consumeSignalingBudget()) return;
    if (!payloadMatchesActiveSession(socket, offer)) return;
    if (!isValidWebRtcOffer(offer)) return;
    const sessionId = normalizeSessionId(socket.data.sessionId);
    const peerId = getPeerId(offer);
    if (
      !sessionId ||
      !peerId ||
      !canCreatePeer(socket, sessionId) ||
      !rememberPeer(socket, peerId)
    ) {
      return;
    }
    if (!peerRegistry.acquire(sessionId, peerId, socket.id, createHash("sha256").update(offer.sdp as string).digest("hex"))) {
      forgetPeer(socket, peerId);
      socket.emit("engine-error", {
        code: "engine_stream_capacity_reached",
        message: "The engine has reached its active stream limit.",
      });
      return;
    }
    relayToSession(socket, "webrtc-offer", stripSessionId(offer));
  });

  socket.on("webrtc-receiver-bind", (payload: unknown) => {
    if (!consumeSignalingBudget() || socket.data.trustedCamera !== true) return;
    const challenge = receiverChallenge(payload);
    const sessionId = normalizeSessionId(socket.data.sessionId);
    if (!challenge || !sessionId) return;
    const receiverSocketId = peerRegistry.bindReceiver(sessionId, challenge.peerId, challenge.bindingId, challenge.offerHash, socket.id);
    if (!receiverSocketId) return;
    const receiverSocket = socket.nsp.sockets.get(receiverSocketId);
    if (!receiverSocket || receiverSocket.data.trustedCamera === true ||
        normalizeSessionId(receiverSocket.data.sessionId) !== sessionId || !canCreatePeer(receiverSocket, sessionId)) {
      peerRegistry.invalidateReceiver(sessionId, challenge.peerId, receiverSocketId);
      return;
    }
    socket.to(receiverSocketId).emit("webrtc-receiver-bind", challenge);
    socket.emit("webrtc-receiver-bound", { ...challenge, receiverSocketId });
  });

  socket.on("webrtc-receiver-observation", (payload: unknown) => {
    if (!consumeSignalingBudget() || socket.data.trustedCamera === true) return;
    const sample = receiverObservation(payload);
    const sessionId = normalizeSessionId(socket.data.sessionId);
    if (!sample || !sessionId) return;
    if (!canCreatePeer(socket, sessionId)) {
      peerRegistry.invalidateReceiver(sessionId, sample.peerId, socket.id);
      return;
    }
    const binding = peerRegistry.observeReceiver(sessionId, socket.id, sample, now());
    if (!binding) return;
    const cameraSocket = socket.nsp.sockets.get(binding.cameraId);
    if (!cameraSocket || cameraSocket.data.trustedCamera !== true || normalizeSessionId(cameraSocket.data.sessionId) !== sessionId) {
      peerRegistry.dropReceiverCamera(binding.cameraId);
      return;
    }
    socket.to(binding.cameraId).emit("webrtc-receiver-observation", {
      ...sample, offerHash: binding.offerHash, receiverSocketId: socket.id,
    });
  });

  socket.on("webrtc-peer-disconnect", (payload: SessionPayload = {}) => {
    if (!isSocketPayload(payload)) return;
    if (!consumeSignalingBudget()) return;
    const peerId = getPeerId(payload);
    if (peerId) {
      const sessionId = normalizeSessionId(socket.data.sessionId);
      if (!sessionId || !payloadMatchesActiveSession(socket, payload) ||
          !peerRegistry.owns(sessionId, peerId, socket.id)) return;
      emitPeerDisconnect(socket, peerId);
      forgetPeer(socket, peerId);
      if (sessionId) peerRegistry.release(sessionId, peerId, socket.id);
    }
  });

  socket.on("webrtc-answer", (answer: SessionPayload = {}) => {
    if (!isSocketPayload(answer)) return;
    if (!consumeSignalingBudget()) return;
    if (socket.data.trustedCamera !== true) return;
    if (!payloadMatchesActiveSession(socket, answer)) return;
    if (!isValidWebRtcAnswer(answer)) return;
    relayToPeerOrSession(socket, "webrtc-answer", answer);
  });

  socket.on("webrtc-ice-candidate", (payload: CandidateEnvelope = {}) => {
    if (!isSocketPayload(payload)) return;
    if (!consumeSignalingBudget()) return;
    if (!payloadMatchesActiveSession(socket, payload)) return;
    const candidate = normalizeIceCandidate(payload);
    const rememberedPeers = Array.isArray(socket.data.webrtcPeerIds)
      ? socket.data.webrtcPeerIds
      : [];
    if (!candidate || !rememberedPeers.includes(candidate.peerId)) return;
    relayToSession(socket, "webrtc-ice-candidate", candidate);
  });

  socket.on(
    "webrtc-ice-candidate-backend",
    (payload: CandidateEnvelope = {}) => {
      if (!isSocketPayload(payload)) return;
      if (!consumeSignalingBudget()) return;
      if (socket.data.trustedCamera !== true) return;
      if (!payloadMatchesActiveSession(socket, payload)) return;
      const candidate = normalizeIceCandidate(payload);
      if (!candidate) return;
      relayToPeerOrSession(
        socket,
        "webrtc-ice-candidate-backend",
        candidate,
      );
    },
  );

  const releasePeers = () => {
    for (const binding of peerRegistry.dropReceiverCamera(socket.id)) {
      socket.to(binding.socketId).emit("webrtc-receiver-unbind", { peerId: binding.peerId, bindingId: binding.bindingId });
    }
    const peerIds = Array.isArray(socket.data.webrtcPeerIds)
      ? socket.data.webrtcPeerIds
      : [];

    for (const peerId of peerIds) {
      if (typeof peerId === "string") emitPeerDisconnect(socket, peerId);
    }
    peerRegistry.releaseSocket(socket.id);
  };
  onSessionChange(socket, releasePeers);
  socket.on("disconnect", releasePeers);
}
