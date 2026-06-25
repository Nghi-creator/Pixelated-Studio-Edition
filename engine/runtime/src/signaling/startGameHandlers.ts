import crypto from "crypto";
import path from "path";
import type { Socket } from "socket.io";
import {
  getSessionRoom,
  joinSession,
  normalizeSessionId,
} from "./sessionRooms";
import { sanitizeUserId } from "../roms/localRomStore";
import {
  findRuntimeByExtension,
  getRuntimeDefinition,
  getRuntimeExtensionForTarget,
} from "../runtime/runtimeRegistry";

type IceServer = {
  credential?: string;
  urls: string | string[];
  username?: string;
};

export type StreamProfile = {
  bitrateKbps: number;
  fps: number;
  id: string;
};

type StartGamePayload = {
  iceServers?: unknown;
  mode?: unknown;
  romFilename?: unknown;
  sessionId?: unknown;
  sessionToken?: unknown;
  streamProfile?: unknown;
  userId?: unknown;
};

type VerifiedBackendSession = {
  expectedSha256?: string | null;
  expectedSizeBytes?: number | null;
  mode: string;
  romTarget: string;
  runtimeId?: string | null;
  userId?: string | null;
};

type RuntimeBootOptions = {
  iceServers?: IceServer[];
  isCloudRom?: boolean;
  runtimeId: string;
  streamProfile: StreamProfile;
};

type Runtime = {
  bootGame(romPath: string, sessionId: string, options: RuntimeBootOptions): void;
};

type RegisterStartGameOptions = {
  apiUrl: string;
  canStartGame?: (socket: Socket, sessionId: string) => boolean;
  downloadCloudRom(
    romUrl: string,
    destinationPath: string,
    validation: {
      expectedSha256?: string | null;
      expectedSizeBytes?: number | null;
      runtimeId: string;
    },
  ): Promise<void>;
  runtime: Runtime;
  verifyBackendSession(options: {
    apiUrl: string;
    sessionId: string;
    sessionToken: string;
  }): Promise<VerifiedBackendSession>;
};

function normalizeStartMode(mode: unknown) {
  return typeof mode === "string" ? mode.trim().toLowerCase() : "";
}

export function hasCloudSessionIntent(payload: StartGamePayload) {
  return (
    normalizeStartMode(payload.mode) === "cloud" || Boolean(payload.sessionToken)
  );
}

export function normalizeIceServers(value: unknown): IceServer[] {
  return Array.isArray(value)
    ? value
        .map((server): IceServer | null => {
          if (!server || typeof server !== "object") return null;
          const rawServer = server as Record<string, unknown>;
          const urls = Array.isArray(rawServer.urls)
            ? rawServer.urls.filter((url): url is string => typeof url === "string")
            : typeof rawServer.urls === "string"
              ? rawServer.urls
              : null;
          if (!urls || (Array.isArray(urls) && urls.length === 0)) return null;
          const normalized: IceServer = {
            credential:
              typeof rawServer.credential === "string"
                ? rawServer.credential
                : undefined,
            urls,
            username:
              typeof rawServer.username === "string"
                ? rawServer.username
                : undefined,
          };
          return normalized;
        })
        .filter((server): server is IceServer => Boolean(server))
    : [];
}

export function normalizeStreamProfile(value: unknown): StreamProfile {
  const profile = value && typeof value === "object" ? value : {};
  const rawProfile = profile as Record<string, unknown>;
  const fps = Number(rawProfile.fps);
  const bitrateKbps = Number(rawProfile.bitrateKbps);
  const id = typeof rawProfile.id === "string" ? rawProfile.id : "balanced";

  return {
    bitrateKbps:
      Number.isFinite(bitrateKbps) && bitrateKbps >= 500 && bitrateKbps <= 2500
        ? Math.round(bitrateKbps)
        : 1000,
    fps: Number.isFinite(fps) && fps >= 24 && fps <= 60 ? Math.round(fps) : 60,
    id: /^[a-z0-9_-]{1,40}$/i.test(id) ? id : "balanced",
  };
}

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
    let romFileOrUrl =
      typeof payload.romFilename === "string" ? payload.romFilename : "";
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

    if (!romFileOrUrl) {
      console.warn("[Node.js] Ignoring start-game without a ROM target");
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
        const verifiedSession = await verifyBackendSession({
          apiUrl,
          sessionId,
          sessionToken: payload.sessionToken,
        });

        if (verifiedSession.mode !== "cloud") {
          throw new Error("Backend session is not approved for cloud boot.");
        }

        romFileOrUrl = verifiedSession.romTarget;
        runtimeId = verifiedSession.runtimeId || "";
        if (!getRuntimeDefinition(runtimeId)) {
          throw new Error("Backend session selected an unsupported runtime.");
        }
        expectedSha256 = verifiedSession.expectedSha256;
        expectedSizeBytes = verifiedSession.expectedSizeBytes;
        safeUserId = sanitizeUserId(verifiedSession.userId || safeUserId);
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

    if (romFileOrUrl.startsWith("http")) {
      const registryRuntime = getRuntimeDefinition(runtimeId);
      if (!registryRuntime) {
        socket.emit("engine-error", {
          message: "Cloud session selected an unsupported runtime.",
        });
        return;
      }
      const extension = getRuntimeExtensionForTarget(
        romFileOrUrl,
        registryRuntime,
      );
      const tmpPath = `/tmp/cloud_game_${crypto.randomUUID()}${extension}`;
      console.log(
        "[Engine] Cloud URL detected. Downloading ROM to temporary storage...",
      );

      try {
        await downloadCloudRom(romFileOrUrl, tmpPath, {
          expectedSha256,
          expectedSizeBytes,
          runtimeId,
        });
        console.log("[Engine] Download complete. Booting Cloud Game.");
        runtime.bootGame(tmpPath, sessionId, {
          ...(iceServers.length > 0 ? { iceServers } : {}),
          isCloudRom: true,
          runtimeId,
          streamProfile,
        });
      } catch (err) {
        console.error("[Engine] Failed to download cloud ROM:", err);
        socket.emit("engine-error", {
          message: err instanceof Error ? err.message : "Cloud ROM failed",
        });
      }
    } else {
      const safeRomFile = path.basename(romFileOrUrl);
      const registryRuntime = findRuntimeByExtension(safeRomFile);
      if (!registryRuntime) {
        socket.emit("engine-error", {
          message: "Unsupported local game file type.",
        });
        return;
      }
      runtime.bootGame(
        path.join("/roms", safeUserId, safeRomFile),
        sessionId,
        {
          ...(iceServers.length > 0 ? { iceServers } : {}),
          runtimeId: registryRuntime.id,
          streamProfile,
        },
      );
    }
  });
}
