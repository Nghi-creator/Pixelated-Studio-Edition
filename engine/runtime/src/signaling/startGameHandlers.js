const crypto = require("crypto");
const path = require("path");
const {
  getSessionRoom,
  joinSession,
  normalizeSessionId,
} = require("./sessionRooms");
const { sanitizeUserId } = require("../roms/localRomStore");

function normalizeStartMode(mode) {
  return typeof mode === "string" ? mode.trim().toLowerCase() : "";
}

function hasCloudSessionIntent(payload) {
  return (
    normalizeStartMode(payload.mode) === "cloud" || Boolean(payload.sessionToken)
  );
}

function normalizeIceServers(value) {
  return Array.isArray(value)
    ? value
        .map((server) => {
          if (!server || typeof server !== "object") return null;
          const urls = Array.isArray(server.urls)
            ? server.urls.filter((url) => typeof url === "string")
            : typeof server.urls === "string"
              ? server.urls
              : null;
          if (!urls || (Array.isArray(urls) && urls.length === 0)) return null;
          return {
            credential:
              typeof server.credential === "string"
                ? server.credential
                : undefined,
            urls,
            username:
              typeof server.username === "string" ? server.username : undefined,
          };
        })
        .filter(Boolean)
    : [];
}

function registerStartGameHandler(socket, options) {
  const { apiUrl, downloadCloudRom, runtime, verifyBackendSession } = options;

  socket.on("start-game", async (payload = {}) => {
    const sessionId =
      normalizeSessionId(payload.sessionId) ||
      socket.data.sessionId ||
      joinSession(socket, crypto.randomUUID(), "browser");
    let romFileOrUrl =
      typeof payload.romFilename === "string" ? payload.romFilename : "";
    let safeUserId = sanitizeUserId(payload.userId || "anonymous");
    socket.data.sessionId = sessionId;
    socket.join(getSessionRoom(sessionId));
    const iceServers = normalizeIceServers(payload.iceServers);

    console.log(
      `\n[Node.js] React requested game boot for session ${sessionId}: ${romFileOrUrl}`,
    );

    if (!romFileOrUrl) {
      console.warn("[Node.js] Ignoring start-game without a ROM target");
      return;
    }

    if (hasCloudSessionIntent(payload)) {
      if (!payload.sessionToken) {
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
      const tmpPath = `/tmp/cloud_game_${crypto.randomUUID()}.nes`;
      console.log(
        "[Engine] Cloud URL detected. Downloading ROM to temporary storage...",
      );

      try {
        await downloadCloudRom(romFileOrUrl, tmpPath);
        console.log("[Engine] Download complete. Booting Cloud Game.");
        runtime.bootGame(tmpPath, sessionId, {
          ...(iceServers.length > 0 ? { iceServers } : {}),
          isCloudRom: true,
        });
      } catch (err) {
        console.error("[Engine] Failed to download cloud ROM:", err);
        socket.emit("engine-error", {
          message: err instanceof Error ? err.message : "Cloud ROM failed",
        });
      }
    } else {
      const safeRomFile = path.basename(romFileOrUrl);
      runtime.bootGame(
        path.join("/roms", safeUserId, safeRomFile),
        sessionId,
        iceServers.length > 0 ? { iceServers } : {},
      );
    }
  });
}

module.exports = {
  hasCloudSessionIntent,
  normalizeIceServers,
  registerStartGameHandler,
};
