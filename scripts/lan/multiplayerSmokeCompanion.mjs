import crypto from "node:crypto";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

export function makeSyntheticOffer(peerId) {
  const fingerprint = crypto
    .randomBytes(32)
    .toString("hex")
    .toUpperCase()
    .match(/.{2}/g)
    .join(":");

  return {
    peerId,
    sdp: [
      "v=0",
      `o=- ${Date.now()} 2 IN IP4 127.0.0.1`,
      "s=Pixelated LAN smoke",
      "t=0 0",
      "a=group:BUNDLE 0 1",
      "a=msid-semantic: WMS",
      "m=video 9 UDP/TLS/RTP/SAVPF 96",
      "c=IN IP4 0.0.0.0",
      "a=mid:0",
      "a=recvonly",
      "a=rtcp:9 IN IP4 0.0.0.0",
      "a=rtcp-mux",
      "a=rtcp-rsize",
      "a=rtpmap:96 VP8/90000",
      "a=ice-options:trickle",
      "a=ice-ufrag:smoke",
      "a=ice-pwd:pixelatedsmokepixelatedsmoke",
      `a=fingerprint:sha-256 ${fingerprint}`,
      "a=setup:actpass",
      "m=audio 9 UDP/TLS/RTP/SAVPF 111",
      "c=IN IP4 0.0.0.0",
      "a=mid:1",
      "a=recvonly",
      "a=rtcp:9 IN IP4 0.0.0.0",
      "a=rtcp-mux",
      "a=rtcp-rsize",
      "a=rtpmap:111 opus/48000/2",
      "a=ice-options:trickle",
      "a=ice-ufrag:smoke",
      "a=ice-pwd:pixelatedsmokepixelatedsmoke",
      `a=fingerprint:sha-256 ${fingerprint}`,
      "a=setup:actpass",
      "",
    ].join("\r\n"),
    type: "offer",
  };
}

export async function connectCompanionGuest({
  companionToken,
  engineUrl,
  expectedSessionId,
  log,
  timeoutMs,
}) {
  const require = createRequire(path.join(REPO_ROOT, "apps/web/package.json"));
  const { io } = require("socket.io-client");
  const peerId = `smoke-${crypto.randomBytes(8).toString("hex")}`;
  const socket = io(engineUrl, {
    autoConnect: false,
    query: { companionToken },
    reconnection: false,
  });
  const disconnectSocket = () => {
    socket.emit("webrtc-peer-disconnect", {
      peerId,
      sessionId: expectedSessionId,
    });
    socket.disconnect();
  };

  const connected = new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Timed out connecting the companion smoke guest.")),
      timeoutMs,
    );
    socket.once("connect_error", (err) => {
      clearTimeout(timeout);
      reject(new Error(`Companion guest Socket.IO connection failed: ${err.message}`));
    });
    socket.once("connect", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
  socket.connect();
  try {
    await connected;
  } catch (err) {
    disconnectSocket();
    throw err;
  }
  log.write("companion-guest-socket-connected", { peerId, socketId: socket.id });

  const lobbyJoined = new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Timed out waiting for companion guest lobby state.")),
      timeoutMs,
    );
    socket.on("lobby-state", (state) => {
      const participant = state?.participants?.find(
        (entry) => entry.socketId === socket.id,
      );
      if (!participant) return;
      clearTimeout(timeout);
      resolve({ participant, state });
    });
  });
  socket.emit("join-session", {
    displayName: "LAN Smoke Guest",
    role: "spectator",
    sessionId: expectedSessionId,
  });
  let lobby;
  try {
    lobby = await lobbyJoined;
  } catch (err) {
    disconnectSocket();
    throw err;
  }
  if (lobby.participant.role !== "spectator") {
    disconnectSocket();
    throw new Error(
      `Companion smoke guest joined as ${lobby.participant.role}, expected spectator.`,
    );
  }
  log.write("companion-guest-lobby-joined", {
    participant: lobby.participant,
    participantCount: lobby.state.participants.length,
  });

  const answered = new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Timed out waiting for the camera WebRTC answer.")),
      timeoutMs,
    );
    socket.on("engine-error", (payload) => {
      clearTimeout(timeout);
      reject(new Error(payload?.message || "Camera rejected the smoke guest."));
    });
    socket.on("webrtc-answer", (answer) => {
      if (answer?.peerId !== peerId) return;
      clearTimeout(timeout);
      resolve(answer);
    });
  });
  socket.emit("webrtc-offer", {
    ...makeSyntheticOffer(peerId),
    sessionId: expectedSessionId,
  });
  log.write("companion-guest-offer-sent", { peerId });
  try {
    await answered;
  } catch (err) {
    disconnectSocket();
    throw err;
  }
  log.write("companion-guest-answer-received", { peerId });

  return {
    disconnect() {
      disconnectSocket();
      log.write("companion-guest-disconnected", { peerId });
    },
    peerId,
  };
}

