import { app, BrowserWindow } from "electron";
import path from "path";
import { cleanupEngine } from "./main/engine/controller";
import { registerIpcHandlers } from "./main/ipc";
import { createShutdownCoordinator } from "./main/shutdown";

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 600,
    height: 700,
    minWidth: 390,
    backgroundColor: "#0B0F19",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event) => {
    event.preventDefault();
  });
  mainWindow.loadFile(path.join(__dirname, "../index.html"));
}

registerIpcHandlers();

const shutdownCoordinator = createShutdownCoordinator(cleanupEngine, () =>
  app.quit(),
);

app.whenReady().then(createWindow);

app.on("before-quit", (event) => {
  shutdownCoordinator.handleBeforeQuit(event);
});

app.on("window-all-closed", () => app.quit());
