const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const { fork } = require("child_process");

let mainWindow;
let serverProcess;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    backgroundColor: "#0B0F19",
    title: "PIXELATED Desktop Console",
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  // Load a simple UI file (we'll create this next)
  mainWindow.loadFile("index.html");

  // Open DevTools if you want to debug
  // mainWindow.webContents.openDevTools();
}

// 1. START THE BACKGROUND SERVER
function startBackendServer() {
  console.log("Starting PIXELATED background server...");

  // 'fork' is like 'spawn' but optimized for Node-to-Node communication
  serverProcess = fork(path.join(__dirname, "server.js"), [], {
    silent: true, // This allows us to capture the logs and send them to the UI
  });

  serverProcess.stdout.on("data", (data) => {
    console.log(`[Server] ${data}`);
    if (mainWindow) {
      mainWindow.webContents.send("server-log", data.toString());
    }
  });

  serverProcess.stderr.on("data", (data) => {
    console.error(`[Server Error] ${data}`);
  });
}

// 2. HANDLE APP LIFECYCLE
app.whenReady().then(() => {
  createWindow();
  startBackendServer();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Kill the background server when the app is closed
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    if (serverProcess) serverProcess.kill();
    app.quit();
  }
});

// 3. UI HANDLERS (Selecting the games folder)
ipcMain.handle("select-folder", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
  });
  return result.filePaths[0];
});

// main.js logic to pass the folder path to the background server
ipcMain.on("update-rom-path", (event, path) => {
  if (serverProcess) {
    serverProcess.send({ type: "SET_ROM_PATH", path: path });
  }
});
