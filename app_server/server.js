const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { spawn, exec } = require("child_process");
const fs = require("fs");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

let retroarchProcess = null;
let cameraProcess = null;

// 1. Boot the Xvfb and Audio once when the server starts
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

// 2. Boot the actual Game and Camera dynamically
function bootGame(romFilename) {
  if (retroarchProcess) retroarchProcess.kill();
  if (cameraProcess) cameraProcess.kill();

  console.log(`[Engine] Mounting ROM: ${romFilename}`);

  retroarchProcess = spawn(
    "retroarch",
    [
      "-f",
      "-L",
      "/cores/mesen_libretro.so",
      "--appendconfig",
      "/app/retroarch.cfg",
      `/roms/${romFilename}`,
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

// --- THE WEBRTC SWITCHBOARD ---
io.on("connection", (socket) => {
  console.log(`[Node.js] Client connected! ID: ${socket.id}`);

  socket.on("start-game", (payload) => {
    const romFile = payload.romFilename;
    console.log(`\n[Node.js] React requested game boot: ${romFile}`);
    bootGame(romFile);
  });

  socket.on("python-ready", () => {
    console.log(
      "[Node.js] Python Camera is armed and ready! Relaying to React...",
    );
    socket.broadcast.emit("python-ready");
  });

  socket.on("webrtc-offer", (offer) => {
    console.log(
      `[Node.js] RECEIVED OFFER FROM REACT! Forwarding to Python Camera...`,
    );
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

  // --- CONTROLS ---
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
