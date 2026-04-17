const { app, BrowserWindow, ipcMain } = require("electron");
const { exec } = require("child_process");
const path = require("path");

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 600,
    height: 480,
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
const enginePath = app.isPackaged
  ? __dirname.replace("app.asar", "app.asar.unpacked")
  : __dirname;

ipcMain.on("start-docker", () => {
  console.log("[Launcher] Booting Cross-Platform Docker Engine...");

  const safeEnv = getSafeEnv();

  const dockerProcess = exec("docker-compose up --build", {
    cwd: enginePath,
    env: safeEnv,
  });

  dockerProcess.stdout.on("data", (data) => {
    mainWindow.webContents.send("server-log", data.toString());
  });

  dockerProcess.stderr.on("data", (data) => {
    mainWindow.webContents.send("server-log", `[Docker Log] ${data}`);
  });

  dockerProcess.on("error", (error) => {
    mainWindow.webContents.send(
      "server-log",
      `<span class="text-red-500">[FATAL ERROR] ${error.message}</span>`,
    );
  });

  dockerProcess.on("exit", (code) => {
    mainWindow.webContents.send(
      "server-log",
      `<span class="text-yellow-500">Docker process exited with code ${code}</span>`,
    );
  });
});

ipcMain.on("stop-docker", () => {
  console.log("[Launcher] Shutting down Docker Engine...");
  mainWindow.webContents.send(
    "server-log",
    `<span class="text-yellow-500">>> Initiating shutdown sequence...</span>`,
  );

  const safeEnv = getSafeEnv();

  const stopProcess = exec("docker-compose down", {
    cwd: enginePath,
    env: safeEnv,
  });

  stopProcess.stdout.on("data", (data) =>
    mainWindow.webContents.send("server-log", data.toString()),
  );
  stopProcess.stderr.on("data", (data) =>
    mainWindow.webContents.send("server-log", `[Docker] ${data}`),
  );

  stopProcess.on("exit", () => {
    mainWindow.webContents.send(
      "server-log",
      `<span class="text-red-500">Engine successfully powered down.</span>`,
    );
    mainWindow.webContents.send("engine-stopped");
  });
});

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  const safeEnv = getSafeEnv();
  exec("docker-compose down", { cwd: enginePath, env: safeEnv });
  app.quit();
});
