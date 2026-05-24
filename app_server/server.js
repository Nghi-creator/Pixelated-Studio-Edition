const express = require("express");
const http = require("http");
const https = require("https");
const { Server } = require("socket.io");
const { spawn, exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const multer = require("multer");
const crypto = require("crypto");

const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://pixelated-studio-edition.vercel.app",
];
const allowedOrigins = (
  process.env.PIXELATED_ALLOWED_ORIGINS || DEFAULT_ALLOWED_ORIGINS.join(",")
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error(`Origin not allowed by CORS: ${origin}`));
  },
  methods: ["GET", "POST", "DELETE"],
};
const MAX_ROM_SIZE_BYTES = Number(
  process.env.PIXELATED_MAX_ROM_SIZE_BYTES || 8 * 1024 * 1024,
);
const MAX_CLOUD_ROM_SIZE_BYTES = Number(
  process.env.PIXELATED_MAX_CLOUD_ROM_SIZE_BYTES || 8 * 1024 * 1024,
);
const CLOUD_ROM_DOWNLOAD_TIMEOUT_MS = Number(
  process.env.PIXELATED_CLOUD_ROM_DOWNLOAD_TIMEOUT_MS || 15000,
);
const ENGINE_TOKEN = process.env.PIXELATED_ENGINE_TOKEN || "";
const allowedRomHosts = (process.env.PIXELATED_ALLOWED_ROM_HOSTS || "")
  .split(",")
  .map((host) => host.trim().toLowerCase())
  .filter(Boolean);

const app = express();
app.use(cors(corsOptions));

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    uptime: process.uptime(),
    activeSessionId,
    engineTokenRequired: Boolean(ENGINE_TOKEN),
  });
});

function isValidEngineToken(token) {
  if (!ENGINE_TOKEN) return true;
  if (typeof token !== "string" || !token) return false;

  const expected = Buffer.from(ENGINE_TOKEN);
  const actual = Buffer.from(token);

  return (
    expected.length === actual.length && crypto.timingSafeEqual(expected, actual)
  );
}

function requireEngineToken(req, res, next) {
  if (isValidEngineToken(req.get("x-engine-token"))) {
    next();
    return;
  }

  res.status(401).json({ error: "Invalid engine pairing token" });
}

const getUserFolder = (userId) => {
  const safeId =
    userId && /^[a-zA-Z0-9_-]+$/.test(userId) ? userId : "anonymous";
  const folderPath = path.join("/roms", safeId);
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
  }
  return folderPath;
};

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const userId = req.headers["x-user-id"];
    cb(null, getUserFolder(userId));
  },
  filename: function (req, file, cb) {
    const safeFilename = path.basename(file.originalname || "unknown.nes");
    cb(null, `${Date.now()}-${crypto.randomUUID()}-${safeFilename}`);
  },
});
const upload = multer({
  storage: storage,
  limits: {
    fileSize: MAX_ROM_SIZE_BYTES,
    files: 1,
  },
  fileFilter: function (req, file, cb) {
    const safeFilename = path.basename(file.originalname || "");
    if (!safeFilename.toLowerCase().endsWith(".nes")) {
      cb(new Error("Only .nes ROM files are supported"));
      return;
    }

    cb(null, true);
  },
});

app.get("/local-games", requireEngineToken, (req, res) => {
  try {
    const userId = req.headers["x-user-id"];
    const userFolder = getUserFolder(userId);

    const files = fs
      .readdirSync(userFolder)
      .filter((file) => file.toLowerCase().endsWith(".nes"))
      .map((file) => ({
        name: file,
        time: fs.statSync(path.join(userFolder, file)).mtime.getTime(),
      }))
      .sort((a, b) => b.time - a.time)
      .map((f) => f.name);

    res.json(files);
  } catch (err) {
    console.error("Failed to read user directory:", err);
    res.json([]);
  }
});

app.post("/upload", requireEngineToken, (req, res) => {
  upload.single("romFile")(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      const message =
        err.code === "LIMIT_FILE_SIZE"
          ? `ROM file is too large. Max size is ${MAX_ROM_SIZE_BYTES} bytes.`
          : err.message;
      return res.status(400).json({ error: message });
    }

    if (err) {
      return res.status(400).json({ error: err.message });
    }

    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    console.log(
      `[Library] New local game added for user: ${req.file.originalname}`,
    );
    res.json({ success: true, filename: req.file.filename });
  });
});

app.delete("/local-games/:filename", requireEngineToken, (req, res) => {
  try {
    const userId = req.headers["x-user-id"];
    const userFolder = getUserFolder(userId);
    const filename = req.params.filename;
    const decodedName = decodeURIComponent(filename);
    const safeName = path.basename(decodedName);
    const filePath = path.join(userFolder, safeName);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`[Library] Deleted local game: ${safeName}`);
      res.json({ success: true });
    } else {
      res.status(404).json({ error: "File not found" });
    }
  } catch (err) {
    console.error("Failed to delete file:", err);
    res.status(500).json({ error: "Failed to delete file" });
  }
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: corsOptions,
});

io.use((socket, next) => {
  const token =
    socket.handshake.auth?.token || socket.handshake.headers["x-engine-token"];

  if (isValidEngineToken(token)) {
    next();
    return;
  }

  next(new Error("Invalid engine pairing token"));
});

let retroarchProcess = null;
let cameraProcess = null;
let activeSessionId = null;
let activeCloudRomPath = null;

function normalizeSessionId(sessionId) {
  return typeof sessionId === "string" && /^[a-zA-Z0-9_-]+$/.test(sessionId)
    ? sessionId
    : null;
}

function getSessionRoom(sessionId) {
  return `session:${sessionId}`;
}

function joinSession(socket, sessionId, role = "unknown") {
  const safeSessionId = normalizeSessionId(sessionId);

  if (!safeSessionId) {
    console.warn(`[Node.js] Refusing invalid session id from ${socket.id}`);
    return null;
  }

  socket.data.sessionId = safeSessionId;
  socket.join(getSessionRoom(safeSessionId));
  console.log(
    `[Node.js] ${role} socket ${socket.id} joined session ${safeSessionId}`,
  );

  return safeSessionId;
}

function relayToSession(socket, eventName, payload) {
  const sessionId =
    normalizeSessionId(payload?.sessionId) || socket.data.sessionId;

  if (!sessionId) {
    console.warn(`[Node.js] Dropping ${eventName}: missing session id`);
    return;
  }

  socket.to(getSessionRoom(sessionId)).emit(eventName, payload);
}

function startVirtualDisplay() {
  console.log("Booting Virtual Display (Xvfb) and PulseAudio...");

  if (fs.existsSync("/tmp/.X99-lock"))
    fs.rmSync("/tmp/.X99-lock", { force: true });
  if (fs.existsSync("/tmp/.X11-unix/X99"))
    fs.rmSync("/tmp/.X11-unix/X99", { force: true, recursive: true });

  spawn("Xvfb", [":99", "-screen", "0", "640x480x24"]);
  exec(
    "pulseaudio -D --system --disallow-exit --disable-shm=yes --load='module-native-protocol-tcp auth-anonymous=1'",
  );

  fs.writeFileSync(
    "/app/retroarch.cfg",
    'audio_driver = "pulse"\n' +
      'audio_sync = "true"\n' +
      'video_vsync = "false"\n',
  );
}

function cleanupActiveSession(sessionId) {
  if (sessionId && activeSessionId && sessionId !== activeSessionId) return;

  if (retroarchProcess) {
    retroarchProcess.kill();
    retroarchProcess = null;
  }

  if (cameraProcess) {
    cameraProcess.kill();
    cameraProcess = null;
  }

  if (activeCloudRomPath) {
    removeFileIfExists(activeCloudRomPath);
    activeCloudRomPath = null;
  }

  activeSessionId = null;
}

function bootGame(absoluteRomPath, sessionId, options = {}) {
  if (retroarchProcess) retroarchProcess.kill();
  if (cameraProcess) cameraProcess.kill();
  if (activeCloudRomPath) removeFileIfExists(activeCloudRomPath);

  activeSessionId = sessionId;
  activeCloudRomPath = options.isCloudRom ? absoluteRomPath : null;

  console.log(
    `[Engine] Mounting ROM for session ${sessionId}: ${absoluteRomPath}`,
  );

  retroarchProcess = spawn(
    "retroarch",
    [
      "-f",
      "-L",
      "/cores/mesen_libretro.so",
      "--appendconfig",
      "/app/retroarch.cfg",
      absoluteRomPath,
    ],
    { env: { ...process.env, DISPLAY: ":99", PULSE_SERVER: "127.0.0.1" } },
  );

  setTimeout(() => {
    console.log("[Engine] Starting Python WebRTC Camera Bridge...");
    cameraProcess = spawn("python3", ["-u", __dirname + "/camera.py"], {
      env: {
        ...process.env,
        PULSE_SERVER: "127.0.0.1",
        PIXELATED_SESSION_ID: sessionId,
        PIXELATED_ENGINE_TOKEN: ENGINE_TOKEN,
      },
    });

    cameraProcess.stdout.on("data", (data) => console.log(`[Camera] ${data}`));
    cameraProcess.stderr.on("data", (data) =>
      console.error(`[Camera Error] ${data}`),
    );
  }, 1000);
}

function validateCloudRomUrl(romUrl) {
  let parsedUrl;

  try {
    parsedUrl = new URL(romUrl);
  } catch (err) {
    throw new Error("Invalid cloud ROM URL");
  }

  if (parsedUrl.protocol !== "https:") {
    throw new Error("Cloud ROM URLs must use HTTPS");
  }

  if (
    allowedRomHosts.length > 0 &&
    !allowedRomHosts.includes(parsedUrl.hostname.toLowerCase())
  ) {
    throw new Error(`Cloud ROM host is not allowed: ${parsedUrl.hostname}`);
  }

  return parsedUrl;
}

function removeFileIfExists(filePath) {
  fs.unlink(filePath, () => {});
}

function downloadCloudRom(romUrl, destinationPath) {
  const parsedUrl = validateCloudRomUrl(romUrl);

  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destinationPath);
    let downloadedBytes = 0;
    let settled = false;

    const fail = (err) => {
      if (settled) return;
      settled = true;
      file.destroy();
      removeFileIfExists(destinationPath);
      reject(err);
    };

    const request = https.get(parsedUrl, (response) => {
      if (response.statusCode !== 200) {
        response.resume();
        fail(
          new Error(
            `Failed to download cloud ROM: status ${response.statusCode}`,
          ),
        );
        return;
      }

      const contentLength = Number(response.headers["content-length"] || 0);
      if (contentLength > MAX_CLOUD_ROM_SIZE_BYTES) {
        response.resume();
        fail(
          new Error(
            `Cloud ROM is too large. Max size is ${MAX_CLOUD_ROM_SIZE_BYTES} bytes.`,
          ),
        );
        return;
      }

      response.on("data", (chunk) => {
        downloadedBytes += chunk.length;
        if (downloadedBytes > MAX_CLOUD_ROM_SIZE_BYTES) {
          response.destroy(
            new Error(
              `Cloud ROM exceeded max size of ${MAX_CLOUD_ROM_SIZE_BYTES} bytes.`,
            ),
          );
        }
      });

      response.on("error", fail);
      file.on("error", fail);
      file.on("finish", () => {
        if (settled) return;
        settled = true;
        file.close(resolve);
      });

      response.pipe(file);
    });

    request.setTimeout(CLOUD_ROM_DOWNLOAD_TIMEOUT_MS, () => {
      request.destroy(new Error("Cloud ROM download timed out"));
    });
    request.on("error", fail);
  });
}

io.on("connection", (socket) => {
  console.log(`[Node.js] Client connected! ID: ${socket.id}`);

  socket.on("join-session", (payload = {}) => {
    joinSession(socket, payload.sessionId, payload.role);
  });

  socket.on("start-game", async (payload = {}) => {
    const sessionId =
      normalizeSessionId(payload.sessionId) ||
      socket.data.sessionId ||
      joinSession(socket, crypto.randomUUID(), "browser");
    const romFileOrUrl = payload.romFilename;
    const rawUserId = payload.userId || "anonymous";
    const safeUserId = /^[a-zA-Z0-9_-]+$/.test(rawUserId)
      ? rawUserId
      : "anonymous";
    socket.data.sessionId = sessionId;
    socket.join(getSessionRoom(sessionId));

    console.log(
      `\n[Node.js] React requested game boot for session ${sessionId}: ${romFileOrUrl}`,
    );

    if (!romFileOrUrl) {
      console.warn("[Node.js] Ignoring start-game without a ROM target");
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
        bootGame(tmpPath, sessionId, { isCloudRom: true });
      } catch (err) {
        console.error("[Engine] Failed to download cloud ROM:", err);
        socket.emit("engine-error", {
          message: err instanceof Error ? err.message : "Cloud ROM failed",
        });
      }
    } else {
      // Boot Local Vault File from User's Personal Folder
      const safeRomFile = path.basename(romFileOrUrl);
      bootGame(path.join("/roms", safeUserId, safeRomFile), sessionId);
    }
  });

  socket.on("python-ready", (payload = {}) => {
    const sessionId =
      normalizeSessionId(payload.sessionId) || socket.data.sessionId;

    if (!sessionId) {
      console.warn("[Node.js] Dropping python-ready: missing session id");
      return;
    }

    joinSession(socket, sessionId, "camera");
    console.log(
      `[Node.js] Python Camera is armed for session ${sessionId}! Relaying to React...`,
    );
    socket.to(getSessionRoom(sessionId)).emit("python-ready", { sessionId });
  });

  socket.on("webrtc-offer", (offer = {}) => {
    const { sessionId: _sessionId, ...offerPayload } = offer;
    relayToSession(socket, "webrtc-offer", offerPayload);
  });

  socket.on("webrtc-answer", (answer = {}) => {
    const { sessionId: _sessionId, ...answerPayload } = answer;
    relayToSession(socket, "webrtc-answer", answerPayload);
  });

  socket.on("webrtc-ice-candidate", (payload) => {
    const candidate = payload?.candidate || payload;
    relayToSession(socket, "webrtc-ice-candidate", candidate);
  });

  socket.on("webrtc-ice-candidate-backend", (payload) => {
    const candidate = payload?.candidate || payload;
    relayToSession(socket, "webrtc-ice-candidate-backend", candidate);
  });

  socket.on("keydown", (data = {}) => {
    if (data.sessionId && data.sessionId !== activeSessionId) return;
    let linuxKey = translateKey(data.key);
    if (linuxKey) exec(`DISPLAY=:99 xdotool keydown ${linuxKey}`);
  });

  socket.on("keyup", (data = {}) => {
    if (data.sessionId && data.sessionId !== activeSessionId) return;
    let linuxKey = translateKey(data.key);
    if (linuxKey) exec(`DISPLAY=:99 xdotool keyup ${linuxKey}`);
  });

  socket.on("stop-session", (payload = {}) => {
    const sessionId =
      normalizeSessionId(payload.sessionId) || socket.data.sessionId;
    cleanupActiveSession(sessionId);
  });
});

function translateKey(browserKey) {
  const keyMap = {
    ArrowUp: "Up",
    ArrowDown: "Down",
    ArrowLeft: "Left",
    ArrowRight: "Right",
    z: "z",
    x: "x",
    Enter: "Return",
    Shift: "Shift_R",
  };
  return keyMap[browserKey] || "";
}

server.listen(8080, "0.0.0.0", () => {
  console.log("Cloud Console API running on port 8080");
  startVirtualDisplay();
});
