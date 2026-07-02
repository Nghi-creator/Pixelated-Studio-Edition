import crypto from "crypto";
import type { Socket } from "socket.io";
import {
  getSessionRoom,
  joinSession,
  normalizeSessionId,
} from "./sessionRooms";
import { sanitizeUserId } from "../roms/localRomStore";
import {
  getRuntimeDefinition,
} from "../runtime/runtimeRegistry";
import {
  launchCloudRomSession,
  launchLocalVaultSession,
  launchNativeSession,
  type DownloadCloudRom,
  type Runtime,
} from "./startGameLaunch";
import {
  hasCloudSessionIntent,
  normalizeIceServers,
  normalizeStreamProfile,
  resolveVerifiedCloudBoot,
  type StartGamePayload,
  type StreamProfile,
  type VerifyBackendSession,
} from "./startGameRequest";

export {
  hasCloudSessionIntent,
  normalizeIceServers,
  normalizeStreamProfile,
  type StreamProfile,
};

type RegisterStartGameOptions = {
  apiUrl: string;
  canStartGame?: (socket: Socket, sessionId: string) => boolean;
  downloadCloudRom: DownloadCloudRom;
  runtime: Runtime;
  verifyBackendSession: VerifyBackendSession;
};

export function registerStartGameHandler(
  socket: Socket,
  options: RegisterStartGameOptions,
) {
  const {
    apiUrl,
    canStartGame,
    downloadCloudRom,
    runtime,
    verifyBackendSession,
  } = options;

  socket.on("start-game", async (payload: StartGamePayload = {}) => {
    const sessionId =
      normalizeSessionId(payload.sessionId) ||
      socket.data.sessionId ||
      joinSession(socket, crypto.randomUUID(), "browser");
    let romFileOrUrl: string | null =
      typeof payload.romFilename === "string" ? payload.romFilename : "";
    let launchManifestId: string | null | undefined;
    let runtimeId = "mesen";
    let expectedSha256: string | null | undefined;
    let expectedSizeBytes: number | null | undefined;
    let safeUserId = sanitizeUserId(payload.userId || "anonymous");
    socket.data.sessionId = sessionId;
    socket.join(getSessionRoom(sessionId));
    const iceServers = normalizeIceServers(payload.iceServers);
    const streamProfile = normalizeStreamProfile(payload.streamProfile);

    if (canStartGame && !canStartGame(socket, sessionId)) {
      socket.emit("engine-error", {
        message: "Only the lobby host can start a game.",
      });
      return;
    }

    console.log(
      `\n[Node.js] React requested game boot for session ${sessionId}: ${romFileOrUrl}`,
    );

    if (!romFileOrUrl && !hasCloudSessionIntent(payload)) {
      console.warn("[Node.js] Ignoring start-game without a game target");
      return;
    }

    if (hasCloudSessionIntent(payload)) {
      if (typeof payload.sessionToken !== "string" || !payload.sessionToken) {
        socket.emit("engine-error", {
          message: "Cloud games require a backend session token.",
        });
        return;
      }

      try {
        const verifiedBoot = await resolveVerifiedCloudBoot({
          apiUrl,
          safeUserId,
          sessionId,
          sessionToken: payload.sessionToken,
          verifyBackendSession,
        });
        romFileOrUrl = verifiedBoot.romFileOrUrl;
        runtimeId = verifiedBoot.runtimeId;
        launchManifestId = verifiedBoot.launchManifestId;
        expectedSha256 = verifiedBoot.expectedSha256;
        expectedSizeBytes = verifiedBoot.expectedSizeBytes;
        safeUserId = verifiedBoot.safeUserId;
      } catch (err) {
        console.error("[Engine] Cloud session verification failed:", err);
        socket.emit("engine-error", {
          message:
            err instanceof Error
              ? err.message
              : "Cloud session verification failed",
        });
        return;
      }
    } else if (romFileOrUrl.startsWith("http")) {
      socket.emit("engine-error", {
        message: "Cloud games require a backend session token.",
      });
      return;
    }

    const verifiedRuntime = getRuntimeDefinition(runtimeId);
    if (verifiedRuntime?.kind === "native_linux") {
      try {
        launchNativeSession({
          iceServers,
          launchManifestId,
          runtime,
          runtimeId,
          sessionId,
          streamProfile,
        });
      } catch (err) {
        console.error("[Engine] Failed to launch native game:", err);
        socket.emit("engine-error", {
          message: err instanceof Error ? err.message : "Native game failed",
        });
      }
    } else if (romFileOrUrl?.startsWith("http")) {
      try {
        await launchCloudRomSession({
          downloadCloudRom,
          expectedSha256,
          expectedSizeBytes,
          iceServers,
          romFileOrUrl,
          runtime,
          runtimeId,
          sessionId,
          streamProfile,
        });
      } catch (err) {
        console.error("[Engine] Failed to prepare cloud ROM:", err);
        socket.emit("engine-error", {
          message: err instanceof Error ? err.message : "Cloud ROM failed",
        });
      }
    } else if (romFileOrUrl) {
      try {
        launchLocalVaultSession({
          iceServers,
          romFileOrUrl,
          runtime,
          safeUserId,
          sessionId,
          streamProfile,
        });
      } catch (err) {
        console.error("[Engine] Failed to launch Local Vault game:", err);
        if (
          err instanceof Error &&
          err.message === "Unsupported local game file type."
        ) {
          socket.emit("engine-error", { message: err.message });
          return;
        }
        socket.emit("engine-error", {
          message:
            err instanceof Error
              ? `Local Vault game failed to launch: ${err.message}`
              : "Local Vault game failed to launch.",
        });
      }
    }
  });

  socket.on("restart-stream", (payload: StartGamePayload = {}) => {
    const sessionId =
      normalizeSessionId(payload.sessionId) || socket.data.sessionId || null;
    if (!sessionId) {
      socket.emit("engine-error", {
        message: "Missing active session for stream restart.",
      });
      return;
    }

    if (canStartGame && !canStartGame(socket, sessionId)) {
      socket.emit("engine-error", {
        message: "Only the lobby host can restart the stream.",
      });
      return;
    }

    try {
      runtime.restartStream(sessionId, {
        iceServers: normalizeIceServers(payload.iceServers),
        streamProfile: normalizeStreamProfile(payload.streamProfile),
      });
    } catch (err) {
      console.error("[Engine] Failed to restart stream:", err);
      socket.emit("engine-error", {
        message:
          err instanceof Error ? err.message : "Stream restart failed.",
      });
    }
  });
}
