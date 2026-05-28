const fs = require("fs");
const { spawn } = require("child_process");
const { translateGamepadButton } = require("./translateGamepadButton");

function createGamepadBridge({ gamepadBridgePath }) {
  let bridgeProcess = null;
  let ready = false;
  let failed = false;

  function start() {
    if (bridgeProcess || failed) return;

    if (!fs.existsSync("/dev/uinput")) {
      failed = true;
      console.warn("[Gamepad] /dev/uinput is unavailable; using keyboard fallback.");
      return;
    }

    bridgeProcess = spawn("python3", ["-u", gamepadBridgePath], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    bridgeProcess.stdout.on("data", (data) => {
      const message = data.toString().trim();
      if (message.includes("[Gamepad] ready")) ready = true;
      if (message) console.log(message);
    });

    bridgeProcess.stderr.on("data", (data) =>
      console.error(`[Gamepad Error] ${data}`),
    );

    bridgeProcess.on("exit", (code) => {
      console.warn(`[Gamepad] bridge exited with code ${code}`);
      bridgeProcess = null;
      ready = false;
      failed = true;
    });
  }

  function stop() {
    if (!bridgeProcess) return;
    bridgeProcess.kill();
    bridgeProcess = null;
    ready = false;
  }

  function sendInput(action, browserKey, playerIndex) {
    if (!bridgeProcess || !ready || !bridgeProcess.stdin.writable) {
      return false;
    }

    const button = translateGamepadButton(browserKey);
    if (!button) return true;

    bridgeProcess.stdin.write(
      `${JSON.stringify({ action, button, playerIndex })}\n`,
    );
    return true;
  }

  function getState() {
    return {
      enabled: Boolean(bridgeProcess),
      failed,
      ready,
      uinputAvailable: fs.existsSync("/dev/uinput"),
    };
  }

  return {
    getState,
    sendInput,
    start,
    stop,
  };
}

module.exports = { createGamepadBridge };
