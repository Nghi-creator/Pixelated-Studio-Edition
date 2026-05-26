const crypto = require("crypto");
const path = require("path");
const {
  getSessionRoom,
  joinSession,
  normalizeSessionId,
} = require("./sessionRooms");
const { sanitizeUserId } = require("../roms/localRomStore");

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

    console.log(
      `\n[Node.js] React requested game boot for session ${sessionId}: ${romFileOrUrl}`,
    );

    if (!romFileOrUrl) {
      console.warn("[Node.js] Ignoring start-game without a ROM target");
      return;
    }

    if (payload.sessionToken) {
      try {
        const verifiedSession = await verifyBackendSession({
          apiUrl,
          sessionId,
          sessionToken: payload.sessionToken,
        });

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
        runtime.bootGame(tmpPath, sessionId, { isCloudRom: true });
      } catch (err) {
        console.error("[Engine] Failed to download cloud ROM:", err);
        socket.emit("engine-error", {
          message: err instanceof Error ? err.message : "Cloud ROM failed",
        });
      }
    } else {
      const safeRomFile = path.basename(romFileOrUrl);
      runtime.bootGame(path.join("/roms", safeUserId, safeRomFile), sessionId);
    }
  });
}

module.exports = { registerStartGameHandler };
