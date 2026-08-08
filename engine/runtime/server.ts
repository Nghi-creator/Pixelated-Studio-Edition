import express from "express";
import http from "http";
import cors from "cors";
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
  getRequestVaultOwnerId,
  getSocketAccessId,
  getSocketAccessScope,
  getSocketClientId,
  getSocketVaultOwnerId,
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
import {
  createSignalingPeerRegistry,
  registerSignalingRelayHandlers,
} from "./src/signaling/signalingRelay";
import { createEngineTokenAuth } from "./src/signaling/socketAuth";
import {
  createGameLaunchCoordinator,
  registerStartGameHandler,
} from "./src/signaling/start-game/startGameHandlers";
import { verifyBackendSession } from "./src/sessions/verifyBackendSession";
import {
  createHealthSnapshot,
  createPublicHealthSnapshot,
  type HealthSnapshotOptions,
} from "./src/telemetry/healthSnapshot";

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
  keyboardBridgePath: HEALTH_PATHS.keyboardBridge,
});
const cloudRoms = createCloudRomDownloader({
  allowedRomHosts,
  maxCloudRomSizeBytes: MAX_CLOUD_ROM_SIZE_BYTES,
  timeoutMs: CLOUD_ROM_DOWNLOAD_TIMEOUT_MS,
});
const healthSnapshotOptions: HealthSnapshotOptions = {
  advertisedUrls: ADVERTISED_URLS,
  companionUrls: COMPANION_URLS,
  exposureMode: ENGINE_EXPOSURE_MODE,
  engineToken: ENGINE_TOKEN,
  getRuntimeState: runtime.getRuntimeState,
  healthPaths: HEALTH_PATHS,
  runtimeKind: ENGINE_RUNTIME_KIND,
};
const getHealthSnapshot = createHealthSnapshot(healthSnapshotOptions);
const getPublicHealthSnapshot = createPublicHealthSnapshot(
  healthSnapshotOptions,
);
const lobby = createLobbyManager();
const signalingPeers = createSignalingPeerRegistry();
const gameLaunchCoordinator = createGameLaunchCoordinator();

registerHealthRoutes(app, getHealthSnapshot, {
  canReadDetails: (request) =>
    request.get("x-pixelated-access-scope") !== "companion-guest" &&
    auth.isValidEngineToken(request.get("x-engine-token")),
  getPublicHealthSnapshot,
  requireEngineToken: auth.requireEngineToken,
});
registerLocalVaultRoutes(app, {
  getVaultOwnerId: getRequestVaultOwnerId,
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
    socket.data.role = role;
    let sessionId: string | null;

    if (role === "camera") {
      sessionId = joinSession(socket, payload.sessionId, role);
    } else {
      const participant = lobby.joinLobby(socket, {
        displayName: payload.displayName,
        requestedRole: role === "browser" ? "host" : role,
        sessionId: payload.sessionId,
      });
      sessionId = participant
        ? normalizeSessionId(socket.data.sessionId)
        : null;
    }
    refreshConnectedClient(socket);

    if (sessionId && role !== "camera") {
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
    getVaultOwnerId: getSocketVaultOwnerId,
    launchCoordinator: gameLaunchCoordinator,
    runtime,
    verifyBackendSession,
  });
  registerSignalingRelayHandlers(socket, {
    canCreatePeer: lobby.canReceiveStream,
    peerRegistry: signalingPeers,
  });
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
    gameLaunchCoordinator.invalidate();
    runtime.cleanupActiveSession(sessionId);
  });
});

export function installEngineShutdownHandlers() {
  let shutdownPromise: Promise<void> | null = null;

  const shutdown = (signal: NodeJS.Signals) => {
    if (shutdownPromise) return shutdownPromise;
    console.log(`[Engine] ${signal} received; shutting down`);
    runtime.shutdown();

    shutdownPromise = new Promise<void>((resolve) => {
      const forceCloseTimer = setTimeout(() => {
        server.closeAllConnections();
        resolve();
      }, 10_000);
      forceCloseTimer.unref();

      io.close(() => {
        clearTimeout(forceCloseTimer);
        if (server.listening) {
          server.close(() => resolve());
        } else {
          resolve();
        }
      });
    });
    return shutdownPromise;
  };

  process.once("SIGINT", () => {
    void shutdown("SIGINT").catch((err) => {
      console.error("[Engine] Shutdown failed", err);
      process.exitCode = 1;
    });
  });
  process.once("SIGTERM", () => {
    void shutdown("SIGTERM").catch((err) => {
      console.error("[Engine] Shutdown failed", err);
      process.exitCode = 1;
    });
  });

  return shutdown;
}

export function startEngineServer(port = 8080, host = "0.0.0.0") {
  installEngineShutdownHandlers();
  server.listen(port, host, () => {
    console.log(`Cloud Console API running on port ${port}`);
    runtime.startVirtualDisplay();
  });
  return server;
}

if (require.main === module) {
  startEngineServer();
}
