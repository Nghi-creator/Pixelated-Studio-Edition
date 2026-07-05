import { app, BrowserWindow } from "electron";
import path from "path";
import { cleanupEngine } from "./main/engine/controller";
import { registerIpcHandlers } from "./main/ipc";

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 600,
    height: 700,
    minWidth: 390,
    backgroundColor: "#0B0F19",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });
  mainWindow.loadFile(path.join(__dirname, "../index.html"));
}

registerIpcHandlers();

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  cleanupEngine();
  app.quit();
});
