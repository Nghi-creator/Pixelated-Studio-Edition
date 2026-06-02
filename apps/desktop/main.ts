import { app, BrowserWindow, ipcMain, type IpcMainEvent } from "electron";
import path from "path";
import {
  cleanupEngine,
  regenerateLanInvite,
  revokeLanInvite,
  startEngine,
  stopEngine,
} from "./main/engineController";

let mainWindow: BrowserWindow | null = null;

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
  mainWindow.loadFile(path.join(__dirname, "../index.html"));
}

ipcMain.on("start-docker", (event: IpcMainEvent, options = {}) => {
  startEngine(event, options);
});

ipcMain.on("stop-docker", (event: IpcMainEvent) => {
  stopEngine(event);
});

ipcMain.on("regenerate-lan-invite", (event: IpcMainEvent) => {
  regenerateLanInvite(event);
});

ipcMain.on("revoke-lan-invite", (event: IpcMainEvent) => {
  revokeLanInvite(event);
});

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  cleanupEngine();
  app.quit();
});
