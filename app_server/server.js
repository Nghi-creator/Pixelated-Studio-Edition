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

function startGameEngine() {
  console.log("Starting Virtual Screen and Audio Engine...");

  // cleanup any existing X server locks or sockets
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

  setTimeout(() => {
    console.log("Starting Emulator...");
    spawn(
      "retroarch",
      [
        "-f",
        "-L",
        "/cores/nestopia_libretro.so",
        "--appendconfig",
        "/app/retroarch.cfg",
        "/roms/little_sisyphus_v1.nes",
      ],
      { env: { ...process.env, DISPLAY: ":99", PULSE_SERVER: "127.0.0.1" } },
    );

    console.log("Starting Python Camera Bridge...");
    const camera = spawn("python3", ["-u", __dirname + "/camera.py"], {
      env: { ...process.env, PULSE_SERVER: "127.0.0.1" },
    });
    camera.stdout.on("data", (data) => console.log(`${data}`));
    camera.stderr.on("data", (data) => console.error(`[Camera Error] ${data}`));
  }, 1000);
}

// --- THE WEBRTC SWITCHBOARD ---
io.on("connection", (socket) => {
  console.log(`[Node.js] Client connected! ID: ${socket.id}`);

  socket.on("python-ready", () =>
    console.log("[Node.js] Python Camera is armed and ready!"),
  );

  socket.on("webrtc-offer", (offer) => {
    console.log(
      `\n[Node.js] RECEIVED OFFER FROM REACT! (Socket: ${socket.id})`,
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
  startGameEngine();
});
