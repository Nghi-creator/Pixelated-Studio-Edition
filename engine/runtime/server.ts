import express from "express";
import http from "http";
import { Server } from "socket.io";
import {
  allowedRomHosts,
  ADVERTISED_URLS,
  CLOUD_ROM_DOWNLOAD_TIMEOUT_MS,
  COMPANION_URLS,
  corsOptions,
  ENGINE_EXPOSURE_MODE,
  ENGINE_RUNTIME_KIND,
  ENGINE_TOKEN,
  HEALTH_PATHS,
  MAX_CLOUD_ROM_SIZE_BYTES,
  MAX_ROM_SIZE_BYTES,
  PIXELATED_API_URL,
} from "./src/config";
import {
  getRequestAccessId,
  getRequestClientId,
  getSocketAccessId,
  getSocketAccessScope,
  getSocketClientId,
  isEngineAccessRevoked,
  isEngineClientRevoked,
  refreshConnectedClient,
  registerConnectedClientRoutes,
  trackHttpClient,
  trackConnectedClient,
} from "./src/clients/connectedClients";
import { registerDisplayFrameRoutes } from "./src/http/displayFrameRoutes";
import { registerErrorHandlers } from "./src/http/errorHandlers";
import { registerHealthRoutes } from "./src/http/healthRoutes";
import { registerLocalVaultRoutes } from "./src/http/localVaultRoutes";
import { registerSessionControlRoutes } from "./src/http/sessionControlRoutes";
import { hardenEngineHttpServer } from "./src/http/serverHardening";
import { registerSmokeTelemetryRoutes } from "./src/http/smokeTelemetryRoutes";
import { createCloudRomDownloader } from "./src/roms/cloudRomDownloader";
import { createProcessManager } from "./src/runtime/processes/processManager";
import { registerEngineErrorHandlers } from "./src/signaling/engineErrorHandlers";
import { registerInputHandlers } from "./src/signaling/inputHandlers";
import { createLobbyManager } from "./src/signaling/lobby/lobby";
import {
  joinSession,
  normalizeSessionId,
} from "./src/signaling/sessionRooms";
import { registerSignalingRelayHandlers } from "./src/signaling/signalingRelay";
import { createEngineTokenAuth } from "./src/signaling/socketAuth";
import { registerStartGameHandler } from "./src/signaling/start-game/startGameHandlers";
import { verifyBackendSession } from "./src/sessions/verifyBackendSession";
import { createHealthSnapshot } from "./src/telemetry/healthSnapshot";

const cors = require("cors");

type SocketPayload = Record<string, unknown>;

function normalizeSocketPayload(payload: unknown): SocketPayload {
  return payload && typeof payload === "object"
    ? (payload as SocketPayload)
    : {};
}

function normalizeSocketRole(role: unknown): string {
  return typeof role === "string" ? role : "unknown";
}

const app = express();
app.use(cors(corsOptions));

const auth = createEngineTokenAuth(ENGINE_TOKEN, {
  getRequestAccessId,
  getRequestClientId,
  getSocketAccessId,
  getSocketClientId,
  isAccessRevoked: isEngineAccessRevoked,
  isClientRevoked: isEngineClientRevoked,
  onHttpAuthenticated: trackHttpClient,
});
const runtime = createProcessManager({
  cameraPath: HEALTH_PATHS.cameraBridge,
  cameraPeerStatePath: HEALTH_PATHS.cameraPeerState,
  engineToken: ENGINE_TOKEN,
  gamepadBridgePath: HEALTH_PATHS.gamepadBridge,
});
const cloudRoms = createCloudRomDownloader({
  allowedRomHosts,
  maxCloudRomSizeBytes: MAX_CLOUD_ROM_SIZE_BYTES,
  timeoutMs: CLOUD_ROM_DOWNLOAD_TIMEOUT_MS,
});
const getHealthSnapshot = createHealthSnapshot({
  advertisedUrls: ADVERTISED_URLS,
  companionUrls: COMPANION_URLS,
  exposureMode: ENGINE_EXPOSURE_MODE,
  engineToken: ENGINE_TOKEN,
  getRuntimeState: runtime.getRuntimeState,
  healthPaths: HEALTH_PATHS,
  runtimeKind: ENGINE_RUNTIME_KIND,
});
const lobby = createLobbyManager();

registerHealthRoutes(app, getHealthSnapshot, {
  canReadDetails: (request) =>
    request.get("x-pixelated-access-scope") !== "companion-guest" &&
    auth.isValidEngineToken(request.get("x-engine-token")),
});
registerLocalVaultRoutes(app, {
  maxRomSizeBytes: MAX_ROM_SIZE_BYTES,
  requireEngineToken: auth.requireEngineToken,
});
registerSmokeTelemetryRoutes(app, {
  getActiveSessionId: runtime.getActiveSessionId,
  requireEngineToken: auth.requireEngineToken,
});
registerDisplayFrameRoutes(app, {
  requireEngineToken: auth.requireEngineToken,
});
registerSessionControlRoutes(app, {
  cleanupActiveSession: runtime.cleanupActiveSession,
  getActiveSessionId: runtime.getActiveSessionId,
  requireEngineToken: auth.requireEngineToken,
});
registerErrorHandlers(app);

const server = http.createServer(app);
hardenEngineHttpServer(server);
const io = new Server(server, {
  cors: corsOptions,
  maxHttpBufferSize: 128 * 1024,
});

io.use(auth.useSocketEngineToken);
registerConnectedClientRoutes(app, {
  io,
  requireEngineToken: auth.requireEngineToken,
});

io.on("connection", (socket) => {
  console.log(`[Node.js] Client connected! ID: ${socket.id}`);
  socket.data.hostEligible =
    getSocketAccessScope(socket) !== "companion-guest";
  trackConnectedClient(socket);

  socket.on("join-session", (rawPayload: unknown = {}) => {
    const payload = normalizeSocketPayload(rawPayload);
    const role = normalizeSocketRole(payload.role);
    const sessionId = joinSession(socket, payload.sessionId, role);
    socket.data.role = role;
    refreshConnectedClient(socket);

    if (sessionId && role !== "camera") {
      lobby.joinLobby(socket, {
        displayName: payload.displayName,
        requestedRole: role === "browser" ? "host" : role,
        sessionId,
      });
      if (
        payload.suppressReady !== true &&
        runtime.getActiveSessionId() === sessionId
      ) {
        socket.emit("python-ready", { sessionId });
      }
    }
  });

  socket.on("client-heartbeat", () => {
    refreshConnectedClient(socket);
  });

  lobby.registerLobbyHandlers(socket);
  registerStartGameHandler(socket, {
    apiUrl: PIXELATED_API_URL,
    canStartGame: lobby.canControlSession,
    downloadCloudRom: cloudRoms.downloadCloudRom,
    runtime,
    verifyBackendSession,
  });
  registerSignalingRelayHandlers(socket);
  registerEngineErrorHandlers(socket);
  registerInputHandlers(socket, runtime, {
    canSendInput: lobby.canSendInput,
  });

  socket.on("stop-session", (rawPayload: unknown = {}) => {
    const payload = normalizeSocketPayload(rawPayload);
    const sessionId =
      normalizeSessionId(payload.sessionId) ||
      (typeof socket.data.sessionId === "string" ? socket.data.sessionId : null);

    if (!lobby.canControlSession(socket, sessionId)) {
      socket.emit("engine-error", {
        message: "Only the lobby host can stop a game.",
      });
      return;
    }
    runtime.cleanupActiveSession(sessionId);
  });
});

server.listen(8080, "0.0.0.0", () => {
  console.log("Cloud Console API running on port 8080");
  runtime.startVirtualDisplay();
});
