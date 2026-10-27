/** Disposable acceptance server: production auth/lobby/relay handlers, no control endpoint. */
const http = require("node:http");
const fs = require("node:fs");
const readline = require("node:readline");
const { spawn } = require("node:child_process");
const { Server } = require("socket.io");
const { ownRelayShutdown } = require("./nativeBrowserShutdown.cjs");
const { createEngineTokenAuth } = require("../../dist/src/signaling/socketAuth.js");
const { canClaimTrustedCamera } = require("../../dist/src/signaling/cameraAuthorization.js");
const { createLobbyManager } = require("../../dist/src/signaling/lobby/lobby.js");
const { registerSignalingRelayHandlers, createSignalingPeerRegistry } = require("../../dist/src/signaling/signalingRelay.js");
const { registerEngineErrorHandlers } = require("../../dist/src/signaling/engineErrorHandlers.js");
const { joinSession } = require("../../dist/src/signaling/sessionRooms.js");
const files = new Map(["index.html", "collector.js", "engine-errors.js", "quality.js", "continuity.js"].map((name) => ["/" + name, fs.readFileSync("/acceptance/" + name)]));
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, "http://localhost").pathname;
  const name = pathname === "/" ? "/index.html" : pathname;
  const body = files.get(name);
  res.writeHead(body ? 200 : 404, { "Content-Type": name?.endsWith(".js") ? "text/javascript" : "text/html", "Cache-Control": "no-store" });
  res.end(body || "Not found");
});
const io = new Server(server, { maxHttpBufferSize: 128 * 1024 });
io.use(createEngineTokenAuth(process.env.PIXELATED_ENGINE_TOKEN).useSocketEngineToken);
const closeRelay = ownRelayShutdown(server, io);
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
  const camera = spawn("python3", ["-u", "/opt/repo/engine/runtime/scripts/n10/native_browser_acceptance.py", "--isolated-browser-acceptance"], { stdio: ["ignore", "pipe", "inherit"] });
  const diagnosticTimer = setTimeout(() => {
    process.stdout.write("N10_ACCEPTANCE " + JSON.stringify({ kind: "relay_shutdown_diagnostic",
      camera_exit: camera.exitCode, camera_signal: camera.signalCode,
      active_resources: process.getActiveResourcesInfo().slice(0, 32) }) + "\n");
  }, 35000);
  diagnosticTimer.unref();
  const lines = readline.createInterface({ input: camera.stdout });
  lines.on("line", (line) => {
    if (line.length > 65536) { camera.kill(); return; }
    process.stdout.write(line + "\n");
    // Only the directly owned CLI host can inject this diagnostic event.
    // There is deliberately no socket handler accepting an injection request.
    if (process.env.N10_BROWSER_ACCEPTANCE_MODE === "observer-static-diagnostic" && line.startsWith("N10_ACCEPTANCE ")) {
      try {
        if (JSON.parse(line.slice(15)).kind === "diagnostic_observer_stop") io.to("session:native_acceptance").emit("acceptance-observer-stop");
      } catch { camera.kill(); }
    }
  });
  camera.on("exit", (code, signal) => {
    process.stdout.write("N10_ACCEPTANCE " + JSON.stringify({ kind: "camera_process_exit", code, signal }) + "\n");
    process.stdout.write("N10_ACCEPTANCE " + JSON.stringify({ kind: "relay_shutdown", stage: "close_start" }) + "\n");
    closeRelay().then(() => {
      process.stdout.write("N10_ACCEPTANCE " + JSON.stringify({ kind: "relay_shutdown", stage: "closed" }) + "\n");
      process.exitCode = code === 0 ? 0 : 1;
    }).catch(() => {
      process.stdout.write('N10_ACCEPTANCE {"kind":"failed","reason":"relay cleanup failed"}\n');
      process.exitCode = 1;
    });
  });
  camera.on("error", () => { void closeRelay().catch(() => {}); process.exitCode = 1; });
});
