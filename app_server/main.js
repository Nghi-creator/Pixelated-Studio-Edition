const { app, BrowserWindow, ipcMain } = require("electron");
const { exec } = require("child_process");
const path = require("path");

let mainWindow;

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
// When packaged, extraResources puts files in process.resourcesPath
const appDir = app.isPackaged ? process.resourcesPath : __dirname;

ipcMain.on("start-docker", (event) => {
  event.reply("server-log", "Checking Docker daemon...");
  const safeEnv = getSafeEnv();

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

    // 2. Build the image (targets the Dockerfile in appDir)
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

      event.reply("server-log", "Build complete. Starting WebRTC Node...");

      // 3. Run the container
      exec(
        "docker run -d --name pixelated-node -p 8080:8080 pixelated-engine",
        { env: safeEnv },
        (runErr) => {
          if (runErr) {
            // If it fails to run, it's usually because the container name is already taken from a crash
            exec("docker rm -f pixelated-node", { env: safeEnv }, () => {
              event.reply(
                "server-log",
                '<span class="text-yellow-500">Cleared old container cache. Click Initialize again.</span>',
              );
              event.reply("engine-stopped");
            });
            return;
          }
          event.reply(
            "server-log",
            '<span class="text-green-500">SUCCESS: PIXELATED Engine running on Port 8080.</span>',
          );
        },
      );
    });
  });
});

ipcMain.on("stop-docker", (event) => {
  event.reply("server-log", "Initiating shutdown sequence...");
  const safeEnv = getSafeEnv();

  // Force remove the container
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

// Cleanup when the user closes the desktop app
app.on("window-all-closed", () => {
  const safeEnv = getSafeEnv();
  exec("docker rm -f pixelated-node", { env: safeEnv });
  app.quit();
});
