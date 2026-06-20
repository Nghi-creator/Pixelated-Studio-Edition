import { app, BrowserWindow, ipcMain, shell, type IpcMainEvent } from "electron";
import path from "path";
import {
  cancelDockerRecovery,
  cleanupEngine,
  createWebLaunchUrl,
  listEngineClients,
  regenerateLanInvite,
  revokeEngineClient,
  revokeLanInvite,
  rotateEngineToken,
  startEngine,
  startDockerAndResume,
  stopEngine,
} from "./main/engine/controller";
import { createCompanionQrDataUrl } from "./main/companion/qr";
import {
  getDockerResourceUrl,
  isDockerDiagnosticCode,
  type DockerResource,
} from "./main/docker/diagnostics";

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

ipcMain.on("rotate-engine-token", (event: IpcMainEvent, options = {}) => {
  rotateEngineToken(event, options);
});

ipcMain.handle("list-engine-clients", () => listEngineClients());

ipcMain.handle("revoke-engine-client", (event, clientId: unknown) => {
  if (typeof clientId !== "string" || !clientId) {
    throw new Error("A connected client id is required.");
  }
  return revokeEngineClient(clientId).then((result) => {
    event.sender.send(
      "server-log",
      `Revoked browser client ${clientId} and disconnected ${result.disconnected} socket(s).`,
    );
    return result;
  });
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
