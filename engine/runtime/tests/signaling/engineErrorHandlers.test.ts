import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { Server } from "socket.io";
import { io as connect } from "socket.io-client";
import { registerEngineErrorHandlers } from "../../src/signaling/engineErrorHandlers";
import { registerSignalingRelayHandlers, createSignalingPeerRegistry } from "../../src/signaling/signalingRelay";
import { joinSession } from "../../src/signaling/sessionRooms";
import { createEngineTokenAuth } from "../../src/signaling/socketAuth";
import { canClaimTrustedCamera } from "../../src/signaling/cameraAuthorization";

test("camera failures reach the owning peer while sibling and foreign sessions remain connected", { timeout: 10000 }, async (t) => {
  const httpServer = http.createServer();
  const server = new Server(httpServer);
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  server.use(createEngineTokenAuth("test-token").useSocketEngineToken);
  const registry = createSignalingPeerRegistry();
  server.on("connection", (socket) => {
    socket.data.trustedCamera = canClaimTrustedCamera("raw", String(socket.handshake.auth.role));
    joinSession(socket, socket.handshake.auth.session);
    registerSignalingRelayHandlers(socket, { peerRegistry: registry });
    registerEngineErrorHandlers(socket);
    socket.on("fence", (ack: () => void) => ack());
  });
  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const address = httpServer.address();
  assert(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}`;
  async function client(role: string, session = "session") {
    const socket = connect(url, {
      auth: { token: "test-token", role, session }, transports: ["websocket"], reconnection: false,
    });
    t.after(() => socket.disconnect());
    await new Promise<void>((resolve, reject) => { socket.once("connect", resolve); socket.once("connect_error", reject); });
    const errors: unknown[] = [];
    socket.on("engine-error", (error: unknown) => errors.push(error));
    return { socket, errors };
  }
  const camera = await client("camera");
  const first = await client("browser");
  const second = await client("browser");
  const other = await client("browser", "other");
  for (const [owner, peerId] of [[first, "first"], [second, "second"]] as const) {
    owner.socket.emit("webrtc-offer", { peerId, type: "offer", sdp: "offer" });
    await owner.socket.timeout(2000).emitWithAck("fence");
  }
  // Sender fence establishes relay completion; receiver fences establish delivery.
  async function send(sender: typeof camera, payload: unknown) {
    sender.socket.emit("engine-error", payload);
    await sender.socket.timeout(2000).emitWithAck("fence");
    await Promise.all([first, second, other].map(({ socket }) => socket.timeout(2000).emitWithAck("fence")));
  }
  await send(camera, { peerId: "first", message: "worker lost" });
  assert.deepEqual(first.errors, [{ peerId: "first", message: "worker lost", source: "camera", sessionId: "session" }]);
  assert.deepEqual(second.errors, []);
  assert.deepEqual(other.errors, []);
  first.errors.length = 0;
  for (const payload of [null, [], { peerId: null }, { peerId: "" }, { peerId: "bad:room" },
    { peerId: "first", sessionId: "other" }, { sessionId: null }, { sessionId: "" }]) await send(camera, payload);
  await send(first, { peerId: "second", message: "forged", source: "camera" });
  await send(first, { message: "forged global failure" });
  assert.deepEqual([first.errors, second.errors, other.errors], [[], [], []]);
  await send(camera, { message: "shared camera failure" });
  assert.equal(first.errors.length, 1);
  assert.equal(second.errors.length, 1);
  assert.equal(other.errors.length, 0);
  joinSession(server.sockets.sockets.get(camera.socket.id!)!, "other");
  await send(camera, { sessionId: "session", peerId: "second", message: "stale session" });
  assert.equal(second.errors.length, 1);
  assert.ok(first.socket.connected && second.socket.connected && other.socket.connected);
});
