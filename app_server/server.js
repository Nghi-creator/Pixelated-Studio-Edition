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

const app = express();
app.use(cors());

const getUserFolder = (userId) => {
  // Only allow alphanumeric, dashes, and underscores to prevent path traversal
  const safeId = (userId && /^[a-zA-Z0-9_-]+$/.test(userId)) ? userId : "anonymous";
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
    cb(null, safeFilename);
  },
});
const upload = multer({ storage: storage });

app.get("/local-games", (req, res) => {
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

app.post("/upload", upload.single("romFile"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  console.log(
    `[Library] New local game added for user: ${req.file.originalname}`,
  );
  res.json({ success: true, filename: req.file.originalname });
});

app.delete("/local-games/:filename", (req, res) => {
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
  cors: { origin: "*", methods: ["GET", "POST"] },
});

let retroarchProcess = null;
let cameraProcess = null;

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

function bootGame(absoluteRomPath) {
  if (retroarchProcess) retroarchProcess.kill();
  if (cameraProcess) cameraProcess.kill();

  console.log(`[Engine] Mounting ROM: ${absoluteRomPath}`);

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
      env: { ...process.env, PULSE_SERVER: "127.0.0.1" },
    });

    cameraProcess.stdout.on("data", (data) => console.log(`[Camera] ${data}`));
    cameraProcess.stderr.on("data", (data) =>
      console.error(`[Camera Error] ${data}`),
    );
  }, 1000);
}

io.on("connection", (socket) => {
  console.log(`[Node.js] Client connected! ID: ${socket.id}`);

  socket.on("start-game", async (payload) => {
    const romFileOrUrl = payload.romFilename;
    const rawUserId = payload.userId || "anonymous";
    const safeUserId = (/^[a-zA-Z0-9_-]+$/.test(rawUserId)) ? rawUserId : "anonymous";
    console.log(`\n[Node.js] React requested game boot: ${romFileOrUrl}`);

    if (romFileOrUrl.startsWith("http")) {
      const tmpPath = `/tmp/cloud_game_${crypto.randomUUID()}.nes`;
      console.log(
        "[Engine] Cloud URL detected. Downloading ROM to temporary storage...",
      );

      const file = fs.createWriteStream(tmpPath);
      https
        .get(romFileOrUrl, (response) => {
          if (response.statusCode !== 200) {
            console.error(
              `[Engine] Failed to download: Status Code ${response.statusCode}`,
            );
            return;
          }
          response.pipe(file);
          file.on("finish", () => {
            file.close();
            console.log("[Engine] Download complete. Booting Cloud Game.");
            bootGame(tmpPath);
          });
        })
        .on("error", (err) => {
          fs.unlink(tmpPath, () => {});
          console.error(
            "[Engine] CRITICAL: Failed to download cloud ROM:",
            err,
          );
        });
    } else {
      // Boot Local Vault File from User's Personal Folder
      const safeRomFile = path.basename(romFileOrUrl);
      bootGame(path.join("/roms", safeUserId, safeRomFile));
    }
  });

  socket.on("python-ready", () => {
    console.log(
      "[Node.js] Python Camera is armed and ready! Relaying to React...",
    );
    socket.broadcast.emit("python-ready");
  });

  socket.on("webrtc-offer", (offer) => {
    socket.broadcast.emit("webrtc-offer", offer);
  });

  socket.on("webrtc-answer", (answer) =>
    socket.broadcast.emit("webrtc-answer", answer),
  );
  socket.on("webrtc-ice-candidate", (candidate) =>
    socket.broadcast.emit("webrtc-ice-candidate", candidate),
  );
  socket.on("webrtc-ice-candidate-backend", (candidate) =>
    socket.broadcast.emit("webrtc-ice-candidate-backend", candidate),
  );

  socket.on("keydown", (data) => {
    let linuxKey = translateKey(data.key);
    if (linuxKey) exec(`DISPLAY=:99 xdotool keydown ${linuxKey}`);
  });

  socket.on("keyup", (data) => {
    let linuxKey = translateKey(data.key);
    if (linuxKey) exec(`DISPLAY=:99 xdotool keyup ${linuxKey}`);
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
