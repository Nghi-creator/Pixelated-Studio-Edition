/** Disposable acceptance server: production auth/lobby/relay handlers, no control endpoint. */
const http = require("node:http");
const fs = require("node:fs");
const { spawn } = require("node:child_process");
const { Server } = require("socket.io");
const { createEngineTokenAuth } = require("../../dist/src/signaling/socketAuth.js");
const { canClaimTrustedCamera } = require("../../dist/src/signaling/cameraAuthorization.js");
const { createLobbyManager } = require("../../dist/src/signaling/lobby/lobby.js");
const { registerSignalingRelayHandlers, createSignalingPeerRegistry } = require("../../dist/src/signaling/signalingRelay.js");
const { registerEngineErrorHandlers } = require("../../dist/src/signaling/engineErrorHandlers.js");
const { joinSession } = require("../../dist/src/signaling/sessionRooms.js");
const files = new Map(["index.html", "collector.js", "engine-errors.js"].map((name) => ["/" + name, fs.readFileSync("/acceptance/" + name)]));
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, "http://localhost").pathname;
  const name = pathname === "/" ? "/index.html" : pathname;
  const body = files.get(name);
  res.writeHead(body ? 200 : 404, { "Content-Type": name?.endsWith(".js") ? "text/javascript" : "text/html", "Cache-Control": "no-store" });
  res.end(body || "Not found");
});
const io = new Server(server, { maxHttpBufferSize: 128 * 1024 });
io.use(createEngineTokenAuth(process.env.PIXELATED_ENGINE_TOKEN).useSocketEngineToken);
const peers = createSignalingPeerRegistry(3);
const lobby = createLobbyManager();
io.on("connection", (socket) => {
  socket.on("join-session", (payload) => {
    if (!payload || payload.sessionId !== "native_acceptance") return;
    const trustedCamera = canClaimTrustedCamera("raw", payload.role);
    socket.data.trustedCamera = trustedCamera;
    socket.data.role = trustedCamera ? "camera" : "browser";
    if (trustedCamera) joinSession(socket, payload.sessionId, "camera");
    else lobby.joinLobby(socket, { sessionId: payload.sessionId, requestedRole: "spectator" });
    socket.emit("acceptance-joined");
  });
  lobby.registerLobbyHandlers(socket);
  registerSignalingRelayHandlers(socket, { peerRegistry: peers, canCreatePeer: lobby.canReceiveStream });
  registerEngineErrorHandlers(socket);
});
server.listen(8080, "0.0.0.0", () => {
  const camera = spawn("python3", ["-u", "/opt/repo/engine/runtime/scripts/n10/native_browser_acceptance.py", "--isolated-browser-acceptance"], { stdio: "inherit" });
  camera.on("exit", (code) => io.close(() => { process.exitCode = code === 0 ? 0 : 1; }));
  camera.on("error", () => { io.close(); process.exitCode = 1; });
});
