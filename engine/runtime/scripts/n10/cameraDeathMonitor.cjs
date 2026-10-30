/** Independent local monitor; camera PID comes from this relay's own ChildProcess. */
const { createInterface } = require("node:readline");
function cameraDeathMonitor(camera, directory, { spawn, forward, timeoutMs = 10000 }) {
  let started = false, completion;
  return {
    start() {
      if (started) throw new Error("camera-death monitor already started");
      if (!Number.isSafeInteger(camera.pid) || camera.pid <= 1 || camera.exitCode !== null || camera.signalCode !== null) throw new Error("exact live owned camera required");
      started = true;
      completion = new Promise((resolve) => {
        const child = spawn("python3", ["-u", "/opt/repo/engine/runtime/scripts/n10/camera_death.py", "--monitor", String(camera.pid), directory], { stdio: ["ignore", "pipe", "inherit"] });
        let failed = false, bytes = 0;
        const timer = setTimeout(() => { failed = true; child.kill(); }, timeoutMs);
        const lines = createInterface({ input: child.stdout });
        lines.on("line", (line) => {
          bytes += Buffer.byteLength(line);
          if (line.length > 65536 || bytes > 1024 * 1024) { failed = true; child.kill(); return; }
          forward(line);
        });
        child.once("error", () => { failed = true; clearTimeout(timer); resolve(false); });
        child.once("close", (code, signal) => { clearTimeout(timer); resolve(!failed && code === 0 && signal === null); });
      });
    },
    async finish(code, signal) {
      if (!started || code !== null || signal !== "SIGKILL" || !await completion) throw new Error("camera-death monitor or exact-camera exit unconfirmed");
    },
  };
}
module.exports = { cameraDeathMonitor };
