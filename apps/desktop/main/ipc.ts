import { app, ipcMain, shell, type IpcMainEvent } from "electron";
import { createCompanionQrDataUrl } from "./companion/invite/qr";
import {
  getDockerResourceUrl,
  isDockerDiagnosticCode,
  type DockerResource,
} from "./docker/diagnostics";
import {
  buildEngineImageAndResume,
  cancelDockerRecovery,
  configureEngineControllerRuntime,
  createWebLaunchUrl,
  listEngineClients,
  regenerateLanInvite,
  revokeEngineClient,
  revokeLanInvite,
  rotateEngineToken,
  startDockerAndResume,
  startEngine,
  stopEngine,
} from "./engine/controller";

export function registerIpcHandlers() {
  configureEngineControllerRuntime({
    getUserDataPath: () => app.getPath("userData"),
    openPath: (targetPath) => shell.openPath(targetPath),
  });

  ipcMain.on("start-docker", (event: IpcMainEvent, options = {}) => {
    startEngine(event, options);
  });

  ipcMain.on("stop-docker", (event: IpcMainEvent) => {
    stopEngine(event);
  });

  ipcMain.on("start-docker-application", (event: IpcMainEvent, options = {}) => {
    startDockerAndResume(event, options);
  });

  ipcMain.on("build-engine-image", (event: IpcMainEvent, options = {}) => {
    buildEngineImageAndResume(event, options);
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
}
