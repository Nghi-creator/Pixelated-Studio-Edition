const { app, BrowserWindow, ipcMain } = require("electron");
const { exec } = require("child_process");
const crypto = require("crypto");
const http = require("http");
const path = require("path");

let mainWindow;
let engineToken = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 600,
    height: 700,
    backgroundColor: "#0B0F19",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });
  mainWindow.loadFile("index.html");
}

// --- CROSS-PLATFORM PATH HANDLER ---
function getSafeEnv() {
  if (process.platform === "win32") {
    return process.env;
  } else {
    return {
      ...process.env,
      PATH: `${process.env.PATH}:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin`,
    };
  }
}

// --- ENGINE RUNTIME PATH RESOLVER ---
const engineRuntimeDir =
  process.env.PIXELATED_ENGINE_RUNTIME_DIR ||
  path.resolve(__dirname, "../../engine/runtime");
const backendApiUrl =
  process.env.PIXELATED_API_URL || "https://pixelated-api-services.onrender.com";
const engineImage = process.env.PIXELATED_ENGINE_IMAGE || "pixelated-engine";
const pullEngineImage =
  process.env.PIXELATED_ENGINE_PULL === "1" ||
  (engineImage !== "pixelated-engine" && process.env.PIXELATED_ENGINE_PULL !== "0");
const buildFallback = process.env.PIXELATED_ENGINE_BUILD_FALLBACK !== "0";

const engineStates = {
  CHECKING_DOCKER: {
    label: "Checking Docker",
    status: "starting",
  },
  PULLING_IMAGE: {
    label: "Pulling Image",
    status: "starting",
  },
  BUILDING_IMAGE: {
    label: "Building Image",
    status: "starting",
  },
  REMOVING_STALE: {
    label: "Removing Stale Container",
    status: "starting",
  },
  STARTING_CONTAINER: {
    label: "Starting Container",
    status: "starting",
  },
  WAITING_HEALTH: {
    label: "Waiting For Health",
    status: "starting",
  },
  READY: {
    label: "Engine Ready",
    status: "ready",
  },
  STOPPING: {
    label: "Stopping Engine",
    status: "stopping",
  },
  STOPPED: {
    label: "Engine Offline",
    status: "stopped",
  },
  FAILED: {
    label: "Engine Failed",
    status: "failed",
  },
};

function emitEngineState(event, key, detail = "") {
  const state = engineStates[key] || engineStates.FAILED;
  event.reply("engine-state", { ...state, detail, key });
}

function quoteDockerEnvValue(value) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\$/g, "\\$")
    .replace(/`/g, "\\`");
}

function isSafeDockerImageRef(value) {
  return /^[a-zA-Z0-9][a-zA-Z0-9._/-]*(?::[a-zA-Z0-9._-]+)?$/.test(value);
}

function waitForEngineHealth(attempts = 30, delayMs = 1000) {
  return new Promise((resolve, reject) => {
    let attempt = 0;

    const check = () => {
      attempt += 1;
      let settled = false;

      const req = http.get("http://127.0.0.1:8080/health", (res) => {
        let body = "";

        res.on("data", (chunk) => {
          body += chunk;
        });

        res.on("end", () => {
          if (res.statusCode === 200) {
            try {
              const payload = JSON.parse(body);
              if (payload.ok) {
                settled = true;
                resolve(payload);
                return;
              }
            } catch (err) {
              // Fall through to retry with a clearer timeout error later.
            }
          }

          if (!settled) retry();
        });
      });

      req.on("error", () => {
        if (!settled) retry();
      });
      req.setTimeout(1000, () => {
        settled = true;
        req.destroy();
        retry();
      });
    };

    const retry = () => {
      if (attempt >= attempts) {
        reject(new Error("Timed out waiting for engine health check."));
        return;
      }

      setTimeout(check, delayMs);
    };

    check();
  });
}

function streamCommand(event, command, options) {
  return new Promise((resolve, reject) => {
    const child = exec(command, options);

    child.stdout.on("data", (data) =>
      event.reply("server-log", data.toString().trim()),
    );
    child.stderr.on("data", (data) =>
      event.reply("server-log", data.toString().trim()),
    );
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Command failed with exit code ${code}`));
    });
  });
}

function execCommand(command, options) {
  return new Promise((resolve, reject) => {
    exec(command, options, (err, stdout, stderr) => {
      if (err) {
        reject(err);
        return;
      }
      resolve({ stderr, stdout });
    });
  });
}

async function prepareEngineImage(event, safeEnv) {
  if (!isSafeDockerImageRef(engineImage)) {
    throw new Error("Invalid PIXELATED_ENGINE_IMAGE value.");
  }

  if (pullEngineImage) {
    emitEngineState(event, "PULLING_IMAGE", engineImage);
    event.reply("server-log", `Pulling engine image: ${engineImage}`);
    try {
      await streamCommand(event, `docker pull ${engineImage}`, { env: safeEnv });
      return;
    } catch (err) {
      if (!buildFallback) throw err;
      event.reply(
        "server-log",
        "Pull failed. Falling back to local engine image build.",
      );
    }
  }

  emitEngineState(event, "BUILDING_IMAGE", engineRuntimeDir);
  event.reply("server-log", "Building local engine image...");
  await streamCommand(event, `docker build -t ${engineImage} .`, {
    cwd: engineRuntimeDir,
    env: safeEnv,
  });
}

ipcMain.on("start-docker", (event) => {
  if (!isSafeDockerImageRef(engineImage)) {
    emitEngineState(event, "FAILED", "Invalid image reference");
    event.reply(
      "server-log",
      '<span class="text-red-500">ERROR: Invalid PIXELATED_ENGINE_IMAGE value.</span>',
    );
    event.reply("engine-stopped");
    return;
  }

  emitEngineState(event, "CHECKING_DOCKER");
  event.reply("server-log", "Checking Docker daemon...");
  const safeEnv = getSafeEnv();
  engineToken = crypto.randomBytes(24).toString("base64url");
  event.reply("engine-token", engineToken);

  // 1. Check if Docker is running
  exec("docker info", { env: safeEnv }, (err) => {
    if (err) {
      emitEngineState(event, "FAILED", "Docker is not running");
      event.reply(
        "server-log",
        '<span class="text-red-500">ERROR: Docker Engine not detected or not running.</span>',
      );
      event.reply("engine-stopped");
      return;
    }

    event.reply("server-log", "Docker Engine found.");

    prepareEngineImage(event, safeEnv)
      .then(() => {
        event.reply("server-log", "Image ready. Preparing WebRTC Node...");
        emitEngineState(event, "REMOVING_STALE");

        // Remove any stale container before running
        return execCommand("docker rm -f pixelated-node", { env: safeEnv }).catch(
          () => undefined,
        );
      })
      .then(() => {
        emitEngineState(event, "STARTING_CONTAINER");
        event.reply("server-log", "Starting WebRTC Node...");

        return execCommand(
          `docker run -d --name pixelated-node -p 127.0.0.1:8080:8080 -v pixelated-roms:/roms -e PIXELATED_ALLOWED_ORIGINS="https://pixelated-studio-edition.vercel.app" -e PIXELATED_ALLOWED_ROM_HOSTS="pxksbsloksyfwiqyfkrz.supabase.co" -e PIXELATED_API_URL="${quoteDockerEnvValue(backendApiUrl)}" -e PIXELATED_ENGINE_TOKEN="${quoteDockerEnvValue(engineToken)}" ${engineImage}`,
          { env: safeEnv },
        );
      })
      .then(() => {
        emitEngineState(event, "WAITING_HEALTH");
        event.reply("server-log", "Waiting for engine health check...");
        return waitForEngineHealth();
      })
      .then(() => {
        emitEngineState(event, "READY", "Port 8080");
        event.reply(
          "server-log",
          '<span class="text-green-500">SUCCESS: PIXELATED Engine healthy on Port 8080.</span>',
        );
      })
      .catch((startErr) => {
        emitEngineState(event, "FAILED", startErr.message);
        event.reply(
          "server-log",
          `<span class="text-red-500">ERROR: ${startErr.message}</span>`,
        );
        exec("docker rm -f pixelated-node", { env: safeEnv }, () => {
          event.reply("engine-stopped");
        });
      });
  });
});

ipcMain.on("stop-docker", (event) => {
  emitEngineState(event, "STOPPING");
  event.reply("server-log", "Initiating shutdown sequence...");
  const safeEnv = getSafeEnv();

  exec("docker rm -f pixelated-node", { env: safeEnv }, (err) => {
    if (err) {
      event.reply(
        "server-log",
        '<span class="text-red-500">Warning: Could not gracefully stop node.</span>',
      );
    } else {
      event.reply("server-log", "Engine successfully terminated.");
    }
    emitEngineState(event, "STOPPED");
    event.reply("engine-stopped");
  });
});

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  const safeEnv = getSafeEnv();
  exec("docker rm -f pixelated-node", { env: safeEnv });
  app.quit();
});
