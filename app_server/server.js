const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { spawn, exec } = require("child_process");
const fs = require("fs");
const path = require("path");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

let retroarchProcess = null;
let cameraProcess = null;

// --- DYNAMIC PATH CONFIGURATION ---
const PATHS = {
  retroarchConfig: path.join(__dirname, "retroarch.cfg"),
  corePath:
    "/Users/nick_kino/Library/Application Support/RetroArch/cores/mesen_libretro.dylib",
};

let currentRomsFolder = "/Users/nick_kino/Documents/GitHub/Project101/my-games";

// LISTEN FOR MESSAGES FROM MAIN.JS (Electron UI)
process.on("message", (message) => {
  if (message.type === "SET_ROM_PATH") {
    currentRomsFolder = message.path;
    console.log(`[Engine] Local Library path updated to: ${currentRomsFolder}`);
  }
});

// 1. Boot the Virtual Display
function startVirtualDisplay() {
  console.log("Checking for Virtual Display environment...");

  if (process.platform === "linux") {
    if (fs.existsSync("/tmp/.X99-lock"))
      fs.rmSync("/tmp/.X99-lock", { force: true });

    spawn("Xvfb", [":99", "-screen", "0", "640x480x24"]);
    exec("pulseaudio -D --system --disallow-exit --disable-shm=yes");
  }

  const configContent =
    'audio_driver = "pulse"\naudio_sync = "true"\nvideo_vsync = "false"\n';
  fs.writeFileSync(PATHS.retroarchConfig, configContent);
}

// 2. Boot the actual Game (Handles Native vs. Remote)
// Inside server.js
function bootGame(romFilename, isRemote = false) {
  if (retroarchProcess) {
    retroarchProcess.kill("SIGKILL");
    retroarchProcess = null;
  }
  if (cameraProcess) {
    cameraProcess.kill("SIGKILL");
    cameraProcess = null;
  }

  const retroarchExe = "/Applications/RetroArch.app/Contents/MacOS/RetroArch";
  const fullRomPath = path.join(currentRomsFolder, romFilename);

  console.log(
    `[Engine] Booting ${isRemote ? "REMOTE" : "NATIVE"} session: ${romFilename}`,
  );

  if (isRemote) {
    retroarchProcess = spawn(retroarchExe, [
      "-L",
      PATHS.corePath,
      "--appendconfig",
      PATHS.retroarchConfig,
      fullRomPath,
    ]);

    setTimeout(() => {
      console.log("[Engine] Starting Python WebRTC Bridge...");

      cameraProcess = spawn(
        "python3",
        ["-u", path.join(__dirname, "camera.py")],
        {
          env: {
            ...process.env,
            PULSE_SERVER: "127.0.0.1",
            GST_PLUGIN_PATH: "/opt/homebrew/lib/gstreamer-1.0",
            GST_PLUGIN_SYSTEM_PATH: "/opt/homebrew/lib/gstreamer-1.0",
            DYLD_LIBRARY_PATH: "/opt/homebrew/lib",
            GI_TYPELIB_PATH: "/opt/homebrew/lib/girepository-1.0",
          },
        },
      );

      cameraProcess.stdout.on("data", (data) =>
        console.log(`[Python]: ${data}`),
      );
      cameraProcess.stderr.on("data", (data) =>
        console.error(`[Python Error]: ${data}`),
      );
      cameraProcess.on("close", (code) =>
        console.log(`[Engine] Python exited: ${code}`),
      );
    }, 1000);
  } else {
    retroarchProcess = spawn(retroarchExe, [
      "-f",
      "-L",
      PATHS.corePath,
      fullRomPath,
    ]);
  }
}

// --- THE WEBRTC SWITCHBOARD ---
io.on("connection", (socket) => {
  console.log(`[Node.js] Client connected! ID: ${socket.id}`);

  socket.on("start-game", (payload) => {
    bootGame(payload.romFilename, payload.isRemote || false);
  });

  socket.on("python-ready", () => {
    console.log("[Node.js] Python Camera ready! Relaying to React...");
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

  // --- CONTROLS (Multiplayer-Ready) ---
  socket.on("keydown", (data) => {
    let linuxKey = translateKey(data.key, data.playerId || 1);
    if (linuxKey && process.platform === "linux") {
      exec(`DISPLAY=:99 xdotool keydown ${linuxKey}`);
    }
  });

  socket.on("keyup", (data) => {
    let linuxKey = translateKey(data.key, data.playerId || 1);
    if (linuxKey && process.platform === "linux") {
      exec(`DISPLAY=:99 xdotool keyup ${linuxKey}`);
    }
  });
});

function translateKey(browserKey, playerId) {
  const p1Map = {
    ArrowUp: "Up",
    ArrowDown: "Down",
    ArrowLeft: "Left",
    ArrowRight: "Right",
    z: "z",
    x: "x",
    Enter: "Return",
    Shift: "Shift_R",
  };

  const p2Map = {
    ArrowUp: "i",
    ArrowDown: "k",
    ArrowLeft: "j",
    ArrowRight: "l",
    z: "v",
    x: "b",
    Enter: "p",
    Shift: "Shift_L",
  };

  return playerId === 2 ? p2Map[browserKey] : p1Map[browserKey];
}

server.listen(8080, "0.0.0.0", () => {
  console.log("Pixelated Desktop Server running on port 8080");
  startVirtualDisplay();
});
