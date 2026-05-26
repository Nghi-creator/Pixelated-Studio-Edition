const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const {
  allowedRomHosts,
  CLOUD_ROM_DOWNLOAD_TIMEOUT_MS,
  corsOptions,
  ENGINE_TOKEN,
  HEALTH_PATHS,
  MAX_CLOUD_ROM_SIZE_BYTES,
  MAX_ROM_SIZE_BYTES,
  PIXELATED_API_URL,
} = require("./src/config");
const { registerErrorHandlers } = require("./src/http/errorHandlers");
const { registerHealthRoutes } = require("./src/http/healthRoutes");
const { registerLocalVaultRoutes } = require("./src/http/localVaultRoutes");
const { createCloudRomDownloader } = require("./src/roms/cloudRomDownloader");
const { createProcessManager } = require("./src/runtime/processManager");
const { registerEngineErrorHandlers } = require("./src/signaling/engineErrorHandlers");
const { registerInputHandlers } = require("./src/signaling/inputHandlers");
const { joinSession, normalizeSessionId } = require("./src/signaling/sessionRooms");
const { registerSignalingRelayHandlers } = require("./src/signaling/signalingRelay");
const { createEngineTokenAuth } = require("./src/signaling/socketAuth");
const { registerStartGameHandler } = require("./src/signaling/startGameHandlers");
const { verifyBackendSession } = require("./src/sessions/verifyBackendSession");
const { createHealthSnapshot } = require("./src/telemetry/healthSnapshot");

const app = express();
app.use(cors(corsOptions));

const auth = createEngineTokenAuth(ENGINE_TOKEN);
const runtime = createProcessManager({
  cameraPath: HEALTH_PATHS.cameraBridge,
  engineToken: ENGINE_TOKEN,
});
const cloudRoms = createCloudRomDownloader({
  allowedRomHosts,
  maxCloudRomSizeBytes: MAX_CLOUD_ROM_SIZE_BYTES,
  timeoutMs: CLOUD_ROM_DOWNLOAD_TIMEOUT_MS,
});
const getHealthSnapshot = createHealthSnapshot({
  engineToken: ENGINE_TOKEN,
  getRuntimeState: runtime.getRuntimeState,
  healthPaths: HEALTH_PATHS,
});

registerHealthRoutes(app, getHealthSnapshot);
registerLocalVaultRoutes(app, {
  maxRomSizeBytes: MAX_ROM_SIZE_BYTES,
  requireEngineToken: auth.requireEngineToken,
});
registerErrorHandlers(app);

const server = http.createServer(app);
const io = new Server(server, {
  cors: corsOptions,
});

io.use(auth.useSocketEngineToken);

io.on("connection", (socket) => {
  console.log(`[Node.js] Client connected! ID: ${socket.id}`);

  socket.on("join-session", (payload = {}) => {
    joinSession(socket, payload.sessionId, payload.role);
  });

  registerStartGameHandler(socket, {
    apiUrl: PIXELATED_API_URL,
    downloadCloudRom: cloudRoms.downloadCloudRom,
    runtime,
    verifyBackendSession,
  });
  registerSignalingRelayHandlers(socket);
  registerEngineErrorHandlers(socket);
  registerInputHandlers(socket, runtime);

  socket.on("stop-session", (payload = {}) => {
    const sessionId =
      normalizeSessionId(payload.sessionId) || socket.data.sessionId;
    runtime.cleanupActiveSession(sessionId);
  });
});

server.listen(8080, "0.0.0.0", () => {
  console.log("Cloud Console API running on port 8080");
  runtime.startVirtualDisplay();
});
