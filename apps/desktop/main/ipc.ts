import {
  app,
  ipcMain,
  shell,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
} from "electron";
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
import {
  getTrustedRendererUrl,
  isTrustedIpcSenderUrl,
} from "./ipcSecurity";

export function registerIpcHandlers() {
  const trustedRendererUrl = getTrustedRendererUrl(__dirname);
  const isTrustedSender = (
    event: IpcMainEvent | IpcMainInvokeEvent,
  ) => isTrustedIpcSenderUrl(event.senderFrame?.url, trustedRendererUrl);
  const assertTrustedSender = (
    event: IpcMainEvent | IpcMainInvokeEvent,
  ) => {
    if (!isTrustedSender(event)) {
      throw new Error("Blocked IPC request from an untrusted renderer.");
    }
  };

  configureEngineControllerRuntime({
    getUserDataPath: () => app.getPath("userData"),
    openPath: (targetPath) => shell.openPath(targetPath),
  });

  ipcMain.on("start-docker", (event: IpcMainEvent, options = {}) => {
    if (!isTrustedSender(event)) return;
    startEngine(event, options);
  });

  ipcMain.on("stop-docker", (event: IpcMainEvent) => {
    if (!isTrustedSender(event)) return;
    stopEngine(event);
  });

  ipcMain.on("start-docker-application", (event: IpcMainEvent, options = {}) => {
    if (!isTrustedSender(event)) return;
    startDockerAndResume(event, options);
  });

  ipcMain.on("build-engine-image", (event: IpcMainEvent, options = {}) => {
    if (!isTrustedSender(event)) return;
    buildEngineImageAndResume(event, options);
  });

  ipcMain.on("cancel-docker-recovery", (event: IpcMainEvent) => {
    if (!isTrustedSender(event)) return;
    cancelDockerRecovery(event);
  });

  ipcMain.on("regenerate-lan-invite", (event: IpcMainEvent) => {
    if (!isTrustedSender(event)) return;
    regenerateLanInvite(event);
  });

  ipcMain.on("revoke-lan-invite", (event: IpcMainEvent) => {
    if (!isTrustedSender(event)) return;
    revokeLanInvite(event);
  });

  ipcMain.on("rotate-engine-token", (event: IpcMainEvent, options = {}) => {
    if (!isTrustedSender(event)) return;
    rotateEngineToken(event, options);
  });

  ipcMain.handle("list-engine-clients", (event) => {
    assertTrustedSender(event);
    return listEngineClients();
  });

  ipcMain.handle("revoke-engine-client", (event, clientId: unknown) => {
    assertTrustedSender(event);
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

  ipcMain.handle("create-companion-qr", (event, url: unknown) => {
    assertTrustedSender(event);
    if (typeof url !== "string") {
      throw new Error("A companion join URL is required.");
    }
    return createCompanionQrDataUrl(url);
  });

  ipcMain.handle("launch-web", async (event) => {
    assertTrustedSender(event);
    const url = createWebLaunchUrl();
    await shell.openExternal(url);
  });

  ipcMain.handle(
    "open-docker-resource",
    async (event, resource: unknown, diagnosticCode: unknown) => {
      assertTrustedSender(event);
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
