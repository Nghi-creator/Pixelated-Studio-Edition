import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { registerSignalingRelayHandlers } from "./signalingRelay";

class FakeSocket extends EventEmitter {
  data: Record<string, unknown> = {};
  id: string;
  joins: string[] = [];
  relays: Array<{ event: string; payload: unknown; room: string }> = [];

  constructor(id: string) {
    super();
    this.id = id;
  }

  join(room: string) {
    this.joins.push(room);
  }

  to(room: string) {
    return {
      emit: (event: string, payload: unknown) => {
        this.relays.push({ event, payload, room });
      },
    };
  }
}

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

  assert.deepEqual(socket.joins, ["peer:peer-1"]);
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
      room: "peer:peer-1",
    },
  ]);
});

test("camera ICE candidate preserves peer id when unwrapping candidate envelopes", () => {
  const socket = new FakeSocket("camera-1");
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
      room: "peer:peer-1",
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
