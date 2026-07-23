import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { registerSignalingRelayHandlers } from "../../src/signaling/signalingRelay";
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
  socket.emit("webrtc-offer", { peerId: "peer-1", sdp: "offer" });
  socket.emit("webrtc-peer-disconnect", { peerId: "peer-1" });

  assert.deepEqual(socket.leaves, ["session:session-1:peer:peer-1"]);
  assert.deepEqual(socket.data.webrtcPeerIds, []);
});

test("signaling rejects oversized peer ids and bounds remembered rooms", () => {
  const socket = new FakeSocket("browser-1");
  socket.data.sessionId = "session-1";
  registerSignalingRelayHandlers(socket as never);

  socket.emit("webrtc-offer", { peerId: "p".repeat(129), sdp: "offer" });
  for (let index = 0; index < 40; index += 1) {
    socket.emit("webrtc-offer", { peerId: `peer-${index}`, sdp: "offer" });
  }

  assert.equal(socket.joins.length, 32);
  assert.equal((socket.data.webrtcPeerIds as string[]).length, 32);
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
