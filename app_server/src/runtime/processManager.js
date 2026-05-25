const { exec, spawn } = require("child_process");
const fs = require("fs");
const { removeFileIfExists } = require("../roms/cloudRomDownloader");

function createProcessManager(options) {
  const { cameraPath, engineToken } = options;
  let retroarchProcess = null;
  let cameraProcess = null;
  let pulseAudioProcess = null;
  let virtualDisplayProcess = null;
  let activeSessionId = null;
  let activeCloudRomPath = null;

  function startVirtualDisplay() {
    console.log("Booting Virtual Display (Xvfb) and PulseAudio...");

    if (fs.existsSync("/tmp/.X99-lock"))
      fs.rmSync("/tmp/.X99-lock", { force: true });
    if (fs.existsSync("/tmp/.X11-unix/X99"))
      fs.rmSync("/tmp/.X11-unix/X99", { force: true, recursive: true });

    virtualDisplayProcess = spawn("Xvfb", [
      ":99",
      "-screen",
      "0",
      "640x480x24",
    ]);
    pulseAudioProcess = exec(
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

  function bootGame(absoluteRomPath, sessionId, bootOptions = {}) {
    if (retroarchProcess) retroarchProcess.kill();
    if (cameraProcess) cameraProcess.kill();
    if (activeCloudRomPath) removeFileIfExists(activeCloudRomPath);

    activeSessionId = sessionId;
    activeCloudRomPath = bootOptions.isCloudRom ? absoluteRomPath : null;

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
      cameraProcess = spawn("python3", ["-u", cameraPath], {
        env: {
          ...process.env,
          PULSE_SERVER: "127.0.0.1",
          PIXELATED_SESSION_ID: sessionId,
          PIXELATED_ENGINE_TOKEN: engineToken,
        },
      });

      cameraProcess.stdout.on("data", (data) => console.log(`[Camera] ${data}`));
      cameraProcess.stderr.on("data", (data) =>
        console.error(`[Camera Error] ${data}`),
      );
    }, 1000);
  }

  function getActiveSessionId() {
    return activeSessionId;
  }

  function getRuntimeState() {
    return {
      activeCloudRomPath,
      activeSessionId,
      cameraProcess,
      pulseAudioProcess,
      retroarchProcess,
      virtualDisplayProcess,
    };
  }

  return {
    bootGame,
    cleanupActiveSession,
    getActiveSessionId,
    getRuntimeState,
    startVirtualDisplay,
  };
}

module.exports = { createProcessManager };
