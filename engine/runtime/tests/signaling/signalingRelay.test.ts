import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import {
  createSignalingPeerRegistry,
  isValidWebRtcOffer,
  normalizeIceCandidate,
  registerSignalingRelayHandlers,
} from "../../src/signaling/signalingRelay";
import { joinSession, normalizeSessionId } from "../../src/signaling/sessionRooms";

class FakeSocket extends EventEmitter {
  data: Record<string, unknown> = {};
  id: string;
  handshake = { headers: {} as Record<string, string> };
  joins: string[] = [];
  leaves: string[] = [];
  relays: Array<{ event: string; payload: unknown; room: string }> = [];
  rooms = new Set<string>();

  constructor(id: string) {
    super();
    this.id = id;
  }

  join(room: string) {
    this.joins.push(room);
    this.rooms.add(room);
  }

  leave(room: string) {
    this.leaves.push(room);
    this.rooms.delete(room);
  }

  to(room: string) {
    return {
      emit: (event: string, payload: unknown) => {
        this.relays.push({ event, payload, room });
      },
    };
  }
}

test("session ids are bounded before becoming socket rooms", () => {
  assert.equal(normalizeSessionId("session-1"), "session-1");
  assert.equal(normalizeSessionId("s".repeat(129)), null);
});

test("WebRTC offers are structurally validated before acquiring peer capacity", () => {
  assert.equal(isValidWebRtcOffer({ sdp: "offer", type: "offer" }), true);
  assert.equal(isValidWebRtcOffer({ type: "offer" }), false);
  assert.equal(isValidWebRtcOffer({ sdp: "", type: "offer" }), false);
  assert.equal(isValidWebRtcOffer({ sdp: "offer", type: "answer" }), false);
  assert.equal(
    isValidWebRtcOffer({ sdp: "s".repeat(64 * 1024 + 1), type: "offer" }),
    false,
  );

  const socket = new FakeSocket("browser-1");
  socket.data.sessionId = "session-1";
  registerSignalingRelayHandlers(socket as never);
  socket.emit("webrtc-offer", { peerId: "peer-1", type: "offer" });

  assert.deepEqual(socket.joins, []);
  assert.deepEqual(socket.relays, []);
  assert.deepEqual(socket.data.webrtcPeerIds || [], []);
});

test("switching sessions leaves the previous session and peer rooms", () => {
  const socket = new FakeSocket("browser-1");
  joinSession(socket as never, "session-1", "browser");
  socket.join("session:session-1:peer:peer-1");
  socket.data.webrtcPeerIds = ["peer-1"];

  joinSession(socket as never, "session-2", "browser");

  assert.deepEqual(socket.leaves, [
    "session:session-1",
    "session:session-1:peer:peer-1",
  ]);
  assert.deepEqual(socket.data.webrtcPeerIds, []);
  assert.deepEqual([...socket.rooms], ["session:session-2"]);
});

test("browser offer joins a peer room and relays to the session room", () => {
  const socket = new FakeSocket("browser-1");
  socket.data.sessionId = "session-1";
  registerSignalingRelayHandlers(socket as never);

  socket.emit("webrtc-offer", {
    peerId: "peer-1",
    sessionId: "session-1",
    sdp: "offer",
    type: "offer",
  });

  assert.deepEqual(socket.joins, ["session:session-1:peer:peer-1"]);
  assert.deepEqual(socket.relays, [
    {
      event: "webrtc-offer",
      payload: { peerId: "peer-1", sdp: "offer", type: "offer" },
      room: "session:session-1",
    },
  ]);
});

test("camera answer with a peer id relays only to that peer room", () => {
  const socket = new FakeSocket("camera-1");
  socket.data.sessionId = "session-1";
  registerSignalingRelayHandlers(socket as never);

  socket.emit("webrtc-answer", {
    peerId: "peer-1",
    sessionId: "session-1",
    sdp: "answer",
    type: "answer",
  });

  assert.deepEqual(socket.relays, [
    {
      event: "webrtc-answer",
      payload: { peerId: "peer-1", sdp: "answer", type: "answer" },
      room: "session:session-1:peer:peer-1",
    },
  ]);
});

test("camera ICE candidate preserves peer id when unwrapping candidate envelopes", () => {
  const socket = new FakeSocket("camera-1");
  socket.data.sessionId = "session-1";
  socket.data.role = "camera";
  registerSignalingRelayHandlers(socket as never);

  socket.emit("webrtc-ice-candidate-backend", {
    candidate: { candidate: "candidate", sdpMLineIndex: 0 },
    peerId: "peer-1",
    sessionId: "session-1",
  });

  assert.deepEqual(socket.relays, [
    {
      event: "webrtc-ice-candidate-backend",
      payload: {
        candidate: "candidate",
        peerId: "peer-1",
        sdpMLineIndex: 0,
      },
      room: "session:session-1:peer:peer-1",
    },
  ]);
});

test("ICE candidates are bounded and structurally validated", () => {
  assert.deepEqual(
    normalizeIceCandidate({
      candidate: {
        candidate: "candidate:1 1 UDP 1 192.0.2.1 5000 typ host",
        sdpMLineIndex: 0,
        sdpMid: "0",
      },
      peerId: "peer-1",
    }),
    {
      candidate: "candidate:1 1 UDP 1 192.0.2.1 5000 typ host",
      peerId: "peer-1",
      sdpMLineIndex: 0,
      sdpMid: "0",
    },
  );
  assert.equal(normalizeIceCandidate({ candidate: {}, peerId: "peer-1" }), null);
  assert.equal(
    normalizeIceCandidate({
      candidate: "c".repeat(4 * 1024 + 1),
      peerId: "peer-1",
      sdpMLineIndex: 0,
    }),
    null,
  );
  assert.equal(
    normalizeIceCandidate({
      candidate: "candidate",
      peerId: "peer-1",
      sdpMLineIndex: -1,
    }),
    null,
  );
});

test("ICE candidates require an acquired peer and camera-only backend direction", () => {
  const browser = new FakeSocket("browser-1");
  browser.data.sessionId = "session-1";
  registerSignalingRelayHandlers(browser as never);

  browser.emit("webrtc-ice-candidate", {
    candidate: { candidate: "candidate", sdpMLineIndex: 0 },
    peerId: "peer-1",
  });
  browser.emit("webrtc-ice-candidate-backend", {
    candidate: { candidate: "candidate", sdpMLineIndex: 0 },
    peerId: "peer-1",
  });
  assert.deepEqual(browser.relays, []);

  browser.emit("webrtc-offer", { peerId: "peer-1", sdp: "offer" });
  browser.relays.length = 0;
  browser.emit("webrtc-ice-candidate", {
    candidate: { candidate: "candidate", sdpMLineIndex: 0 },
    peerId: "peer-1",
  });
  assert.equal(browser.relays.length, 1);
});

test("browser peer disconnect relays only a peer cleanup event to the session", () => {
  const socket = new FakeSocket("browser-1");
  socket.data.sessionId = "session-1";
  registerSignalingRelayHandlers(socket as never);

  socket.emit("webrtc-peer-disconnect", {
    peerId: "peer-1",
    sessionId: "session-1",
  });

  assert.deepEqual(socket.relays, [
    {
      event: "webrtc-peer-disconnect",
      payload: { peerId: "peer-1", sessionId: "session-1" },
      room: "session:session-1",
    },
  ]);
});

test("peer disconnect releases remembered rooms", () => {
  const socket = new FakeSocket("browser-1");
  socket.data.sessionId = "session-1";
  registerSignalingRelayHandlers(socket as never);
  socket.emit("webrtc-offer", {
    peerId: "peer-1",
    sdp: "offer",
    type: "offer",
  });
  socket.emit("webrtc-peer-disconnect", { peerId: "peer-1" });

  assert.deepEqual(socket.leaves, ["session:session-1:peer:peer-1"]);
  assert.deepEqual(socket.data.webrtcPeerIds, []);
});

test("signaling rejects oversized peer ids and allows one peer per socket", () => {
  const socket = new FakeSocket("browser-1");
  socket.data.sessionId = "session-1";
  registerSignalingRelayHandlers(socket as never);

  socket.emit("webrtc-offer", { peerId: "p".repeat(129), sdp: "offer" });
  for (let index = 0; index < 40; index += 1) {
    socket.emit("webrtc-offer", { peerId: `peer-${index}`, sdp: "offer" });
  }

  assert.equal(socket.joins.length, 1);
  assert.equal((socket.data.webrtcPeerIds as string[]).length, 1);
});

test("signaling rejects offers from sockets outside the active lobby", () => {
  const socket = new FakeSocket("browser-1");
  socket.data.sessionId = "session-1";
  registerSignalingRelayHandlers(socket as never, {
    canCreatePeer: () => false,
  });

  socket.emit("webrtc-offer", {
    peerId: "peer-1",
    sdp: "offer",
    type: "offer",
  });

  assert.deepEqual(socket.joins, []);
  assert.deepEqual(socket.relays, []);
});

test("signaling bounds active peers across sockets and releases capacity", () => {
  const registry = createSignalingPeerRegistry(1);
  const firstSocket = new FakeSocket("browser-1");
  const secondSocket = new FakeSocket("browser-2");
  firstSocket.data.sessionId = "session-1";
  secondSocket.data.sessionId = "session-1";
  registerSignalingRelayHandlers(firstSocket as never, {
    peerRegistry: registry,
  });
  registerSignalingRelayHandlers(secondSocket as never, {
    peerRegistry: registry,
  });

  firstSocket.emit("webrtc-offer", { peerId: "peer-1", sdp: "offer" });
  secondSocket.emit("webrtc-offer", { peerId: "peer-2", sdp: "offer" });
  assert.equal(firstSocket.joins.length, 1);
  assert.equal(secondSocket.rooms.has("session:session-1:peer:peer-2"), false);
  assert.equal(secondSocket.relays.length, 0);
  assert.equal(registry.size(), 1);

  firstSocket.emit("webrtc-peer-disconnect", { peerId: "peer-1" });
  secondSocket.emit("webrtc-offer", { peerId: "peer-2", sdp: "offer" });
  assert.equal(secondSocket.rooms.has("session:session-1:peer:peer-2"), true);
  assert.equal(secondSocket.relays.length, 1);
  assert.equal(registry.size(), 1);
});

test("signaling events share a bounded per-socket rate limit", () => {
  const socket = new FakeSocket("browser-1");
  socket.data.sessionId = "session-1";
  socket.data.webrtcPeerIds = ["peer-1"];
  let now = 1_000;
  registerSignalingRelayHandlers(socket as never, {
    eventLimitPerSecond: 2,
    now: () => now,
  });

  socket.emit("webrtc-ice-candidate", {
    candidate: "candidate-1",
    peerId: "peer-1",
    sdpMLineIndex: 0,
  });
  socket.emit("webrtc-ice-candidate", {
    candidate: "candidate-2",
    peerId: "peer-1",
    sdpMLineIndex: 0,
  });
  socket.emit("webrtc-ice-candidate", {
    candidate: "candidate-3",
    peerId: "peer-1",
    sdpMLineIndex: 0,
  });
  socket.emit("webrtc-answer", { type: "answer" });

  assert.equal(socket.relays.length, 2);

  now += 1_000;
  socket.emit("webrtc-ice-candidate", {
    candidate: "candidate-4",
    peerId: "peer-1",
    sdpMLineIndex: 0,
  });
  assert.equal(socket.relays.length, 3);
});

test("signaling cannot target a different session than the active socket", () => {
  const socket = new FakeSocket("browser-1");
  socket.data.sessionId = "session-1";
  registerSignalingRelayHandlers(socket as never);

  socket.emit("webrtc-offer", {
    peerId: "peer-1",
    sessionId: "session-2",
    sdp: "offer",
  });
  socket.emit("webrtc-ice-candidate", {
    candidate: "candidate",
    sessionId: "session-2",
  });

  assert.deepEqual(socket.joins, []);
  assert.deepEqual(socket.relays, []);
});

test("browser companions cannot impersonate the camera bridge", () => {
  const socket = new FakeSocket("guest-1");
  socket.handshake.headers["x-pixelated-access-scope"] = "companion-guest";
  registerSignalingRelayHandlers(socket as never);

  socket.emit("python-ready", { sessionId: "session-1" });

  assert.equal(socket.data.sessionId, undefined);
  assert.deepEqual(socket.joins, []);
  assert.deepEqual(socket.relays, []);
});
