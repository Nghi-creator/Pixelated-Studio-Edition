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

// --- PRODUCTION PATH RESOLVER ---
const appDir = __dirname;

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

ipcMain.on("start-docker", (event) => {
  event.reply("server-log", "Checking Docker daemon...");
  const safeEnv = getSafeEnv();
  engineToken = crypto.randomBytes(24).toString("base64url");
  event.reply("engine-token", engineToken);

  // 1. Check if Docker is running
  exec("docker info", { env: safeEnv }, (err) => {
    if (err) {
      event.reply(
        "server-log",
        '<span class="text-red-500">ERROR: Docker Engine not detected or not running.</span>',
      );
      event.reply("engine-stopped");
      return;
    }

    event.reply("server-log", "Docker Engine found. Compiling container...");

    // 2. Build the image
    const buildCmd = exec("docker build -t pixelated-engine .", {
      cwd: appDir,
      env: safeEnv,
    });

    buildCmd.stdout.on("data", (data) =>
      event.reply("server-log", data.toString().trim()),
    );
    buildCmd.stderr.on("data", (data) =>
      event.reply("server-log", data.toString().trim()),
    );

    buildCmd.on("close", (code) => {
      if (code !== 0) {
        event.reply(
          "server-log",
          '<span class="text-red-500">ERROR: Build failed.</span>',
        );
        event.reply("engine-stopped");
        return;
      }

      event.reply("server-log", "Build complete. Preparing WebRTC Node...");

      // 3. Remove any stale container before running
      exec("docker rm -f pixelated-node", { env: safeEnv }, () => {
        event.reply("server-log", "Starting WebRTC Node...");

        // 4. Run the container
        exec(
          `docker run -d --name pixelated-node -p 127.0.0.1:8080:8080 -v pixelated-roms:/roms -e PIXELATED_ALLOWED_ORIGINS="https://pixelated-studio-edition.vercel.app" -e PIXELATED_ALLOWED_ROM_HOSTS="pxksbsloksyfwiqyfkrz.supabase.co" -e PIXELATED_ENGINE_TOKEN="${engineToken}" pixelated-engine`,
          { env: safeEnv },
          (runErr) => {
            if (runErr) {
              event.reply(
                "server-log",
                '<span class="text-red-500">ERROR: Could not start engine container.</span>',
              );
              event.reply("engine-stopped");
              return;
            }

            event.reply("server-log", "Waiting for engine health check...");
            waitForEngineHealth()
              .then(() => {
                event.reply(
                  "server-log",
                  '<span class="text-green-500">SUCCESS: PIXELATED Engine healthy on Port 8080.</span>',
                );
              })
              .catch((healthErr) => {
                event.reply(
                  "server-log",
                  `<span class="text-red-500">ERROR: ${healthErr.message}</span>`,
                );
                exec("docker rm -f pixelated-node", { env: safeEnv }, () => {
                  event.reply("engine-stopped");
                });
              });
          },
        );
      });
    });
  });
});

ipcMain.on("stop-docker", (event) => {
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
    event.reply("engine-stopped");
  });
});

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  const safeEnv = getSafeEnv();
  exec("docker rm -f pixelated-node", { env: safeEnv });
  app.quit();
});
