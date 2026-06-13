import { app, BrowserWindow, ipcMain, shell, type IpcMainEvent } from "electron";
import path from "path";
import {
  cancelDockerRecovery,
  cleanupEngine,
  createWebLaunchUrl,
  regenerateLanInvite,
  revokeLanInvite,
  startEngine,
  startDockerAndResume,
  stopEngine,
} from "./main/engineController";
import { createCompanionQrDataUrl } from "./main/companionQr";
import {
  getDockerResourceUrl,
  isDockerDiagnosticCode,
  type DockerResource,
} from "./main/dockerDiagnostics";

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

ipcMain.on("start-docker-application", (event: IpcMainEvent, options = {}) => {
  startDockerAndResume(event, options);
});

ipcMain.on("cancel-docker-recovery", (event: IpcMainEvent) => {
  cancelDockerRecovery(event);
});

ipcMain.on("regenerate-lan-invite", (event: IpcMainEvent) => {
  regenerateLanInvite(event);
});

ipcMain.on("revoke-lan-invite", (event: IpcMainEvent) => {
  revokeLanInvite(event);
});

ipcMain.handle("create-companion-qr", (_event, url: unknown) => {
  if (typeof url !== "string") {
    throw new Error("A companion join URL is required.");
  }
  return createCompanionQrDataUrl(url);
});

ipcMain.handle("launch-web", async () => {
  const url = createWebLaunchUrl();
  await shell.openExternal(url);
});

ipcMain.handle(
  "open-docker-resource",
  async (_event, resource: unknown, diagnosticCode: unknown) => {
    if (resource !== "guide" && resource !== "install") {
      throw new Error("Unknown Docker resource.");
    }
    if (!isDockerDiagnosticCode(diagnosticCode)) {
      throw new Error("Unknown Docker diagnostic.");
    }

    const url = getDockerResourceUrl(
      resource as DockerResource,
      diagnosticCode,
    );
    await shell.openExternal(url);
  },
);

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  cleanupEngine();
  app.quit();
});
