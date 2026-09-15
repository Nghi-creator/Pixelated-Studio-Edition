import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { Server } from "socket.io";
import { io as connect } from "socket.io-client";
import { registerSignalingRelayHandlers } from "../../src/signaling/signalingRelay";
import { createEngineTokenAuth } from "../../src/signaling/socketAuth";
import { registerInputHandlers } from "../../src/signaling/inputHandlers";
import { createLobbyManager } from "../../src/signaling/lobby/lobby";
import { registerEngineErrorHandlers } from "../../src/signaling/engineErrorHandlers";
import { registerStartGameHandler } from "../../src/signaling/start-game/startGameHandlers";

test("malformed wire messages cannot terminate a paired engine connection", async () => {
  const server = http.createServer();
  const io = new Server(server);
  io.use(createEngineTokenAuth("test-token").useSocketEngineToken);
  io.on("connection", (socket) => {
    socket.data.sessionId = "test-session";
    socket.data.hostEligible = false;
    registerSignalingRelayHandlers(socket);
    registerInputHandlers(socket, { getActiveSessionId: () => "test-session" });
    createLobbyManager().registerLobbyHandlers(socket);
    registerEngineErrorHandlers(socket);
    registerStartGameHandler(socket, {
      apiUrl: "", downloadCloudRom: async () => { throw new Error("must not download"); },
      verifyBackendSession: async () => { throw new Error("must not verify"); },
      runtime: {} as never,
    });
    socket.on("audit-ping", (ack: () => void) => ack());
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  const client = connect(`http://127.0.0.1:${address.port}`, { auth: { token: "test-token" }, transports: ["websocket"], reconnection: false });
  try {
    await new Promise<void>((resolve, reject) => { client.once("connect", resolve); client.once("connect_error", reject); });
    for (const event of ["webrtc-offer", "webrtc-answer", "webrtc-ice-candidate", "webrtc-ice-candidate-backend", "python-ready", "webrtc-peer-disconnect", "keydown", "keyup", "join-lobby", "request-player-slot", "release-player-slot", "lobby-kick", "engine-error", "start-game", "restart-stream"]) {
      for (const payload of [null, [], "bad", 1, true]) client.emit(event, payload);
    }
    await client.timeout(2000).emitWithAck("audit-ping");
    assert.equal(client.connected, true);
  } finally {
    client.disconnect();
    await new Promise<void>((resolve) => io.close(() => resolve()));
  }
});
