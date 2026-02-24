const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { spawn, exec } = require("child_process");
const net = require("net");
const fs = require("fs");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

process.on("uncaughtException", (err) => console.error("\n[FATAL ERROR]", err));
process.on("unhandledRejection", (reason) =>
  console.error("\n[UNHANDLED PROMISE]", reason),
);

function startGameEngine() {
  console.log("Starting Virtual Screen...");
  const xvfb = spawn("Xvfb", [":99", "-screen", "0", "640x480x24"]);

  const config = `
  vrr_runloop_enable = "true"
  audio_driver = "null"
  `;
  fs.writeFileSync("/app/retroarch.cfg", config);

  setTimeout(() => {
    console.log("Starting Emulator and Camera...");

    const retroarch = spawn(
      "retroarch",
      [
        "-f",
        "-L",
        "/cores/nestopia_libretro.so",
        "--appendconfig",
        "/app/retroarch.cfg",
        "/roms/little_sisyphus_v1.nes",
      ],
      { env: { ...process.env, DISPLAY: ":99" } },
    );
    retroarch.stderr.on("data", (data) => console.log(`[RetroArch] ${data}`));

    const gstArgs = [
      "ximagesrc",
      "display-name=:99",
      "!",
      "video/x-raw,framerate=30/1",
      "!",
      "videoscale",
      "!",
      "video/x-raw,width=640,height=480",
      "!",
      "videoconvert",
      "!",
      "jpegenc",
      "quality=60",
      "!",
      "tcpclientsink",
      "host=127.0.0.1",
      "port=5000",
    ];
    const gst = spawn("gst-launch-1.0", gstArgs, {
      env: { ...process.env, DISPLAY: ":99" },
    });
    gst.stderr.on("data", (data) => console.log(`[GStreamer] ${data}`));
  }, 1000);
}

// --- TCP CAPTURE CARD ---
const tcpServer = net.createServer((socket) => {
  console.log("Camera connected to TCP Capture Card!");

  let imageBuffer = Buffer.alloc(0);
  const JPEG_START = Buffer.from([0xff, 0xd8]);
  const JPEG_END = Buffer.from([0xff, 0xd9]);

  socket.on("data", (chunk) => {
    // 1. Add new data to buffer
    imageBuffer = Buffer.concat([imageBuffer, chunk]);

    // 2. Look for the start and end of a JPEG
    let startIdx = imageBuffer.indexOf(JPEG_START);
    let endIdx = imageBuffer.indexOf(JPEG_END);

    // 3. Send full image to React
    while (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      const frame = imageBuffer.subarray(startIdx, endIdx + 2);
      io.emit("video-frame", frame.toString("base64"));

      imageBuffer = imageBuffer.subarray(endIdx + 2);

      startIdx = imageBuffer.indexOf(JPEG_START);
      endIdx = imageBuffer.indexOf(JPEG_END);
    }
  });
});

tcpServer.listen(5000, "127.0.0.1", () =>
  console.log("TCP Video Server listening on port 5000"),
);

io.on("connection", (socket) => {
  console.log("A player connected to the console!");

  socket.on("key-press", (data) => {
    let linuxKey = translateKey(data.key);
    if (linuxKey) {
      exec(`DISPLAY=:99 xdotool key ${linuxKey}`, (err) => {
        if (err) console.error("[xdotool Error]:", err);
      });
    }
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
