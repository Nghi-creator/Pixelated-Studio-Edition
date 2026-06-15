import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";

type ExposureMode = "local" | "lan";

type StartDockerOptions = {
  exposureMode?: ExposureMode;
};

type EngineStatus = "failed" | "ready" | "starting" | "stopped" | "stopping";

type EngineStatePayload = {
  detail: string;
  key: string;
  label: string;
  phase: string;
  status: EngineStatus;
};

type EngineExposurePayload = {
  advertisedUrls?: string[];
  companionUrls?: string[];
  exposureMode?: ExposureMode;
};

type EngineCompanionPayload = {
  certPath?: string;
  enabled: boolean;
  error?: string;
  inviteCode?: string;
  inviteExpiresAt?: string;
  inviteRevoked?: boolean;
  inviteStatus?: string;
  urls: string[];
};

type EngineClientPayload = {
  accessScope: "companion-guest" | "companion-host" | "raw";
  connectedAt: string;
  id: string;
  lastSeenAt: string;
  remoteAddress: string;
  role: string;
  sessionId: string | null;
  socketCount: number;
  userAgent: string;
};

type DockerDiagnosticPayload = {
  canStartDocker: boolean;
  code: string;
  detail: string;
  guidance: string;
  guideUrl: string;
  installUrl: string;
  platform: NodeJS.Platform;
  summary: string;
  title: string;
};

type IpcCallback<TArgs extends unknown[] = []> = (
  event: IpcRendererEvent,
  ...args: TArgs
) => void;

contextBridge.exposeInMainWorld("electronAPI", {
  createCompanionQrDataUrl: (url: string) =>
    ipcRenderer.invoke("create-companion-qr", url) as Promise<string>,
  launchWeb: () => ipcRenderer.invoke("launch-web") as Promise<void>,
  listEngineClients: () =>
    ipcRenderer.invoke("list-engine-clients") as Promise<{
      clients: EngineClientPayload[];
    }>,
  openDockerResource: (resource: "guide" | "install", diagnosticCode: string) =>
    ipcRenderer.invoke(
      "open-docker-resource",
      resource,
      diagnosticCode,
    ) as Promise<void>,
  startDocker: (options: StartDockerOptions) =>
    ipcRenderer.send("start-docker", options),
  startDockerApplication: (options: StartDockerOptions) =>
    ipcRenderer.send("start-docker-application", options),
  cancelDockerRecovery: () => ipcRenderer.send("cancel-docker-recovery"),
  stopDocker: () => ipcRenderer.send("stop-docker"),
  regenerateLanInvite: () => ipcRenderer.send("regenerate-lan-invite"),
  revokeLanInvite: () => ipcRenderer.send("revoke-lan-invite"),
  revokeEngineClient: (clientId: string) =>
    ipcRenderer.invoke("revoke-engine-client", clientId) as Promise<{
      disconnected: number;
    }>,
  rotateEngineToken: (options: StartDockerOptions) =>
    ipcRenderer.send("rotate-engine-token", options),
  onServerLog: (callback: IpcCallback<[string]>) =>
    ipcRenderer.on("server-log", callback),
  onEngineState: (callback: IpcCallback<[EngineStatePayload]>) =>
    ipcRenderer.on("engine-state", callback),
  onEngineStopped: (callback: IpcCallback) =>
    ipcRenderer.on("engine-stopped", callback),
  onEngineToken: (callback: IpcCallback<[string]>) =>
    ipcRenderer.on("engine-token", callback),
  onEngineExposure: (callback: IpcCallback<[EngineExposurePayload]>) =>
    ipcRenderer.on("engine-exposure", callback),
  onEngineCompanion: (callback: IpcCallback<[EngineCompanionPayload]>) =>
    ipcRenderer.on("engine-companion", callback),
  onDockerDiagnostic: (callback: IpcCallback<[DockerDiagnosticPayload]>) =>
    ipcRenderer.on("docker-diagnostic", callback),
  onDockerRecoveryStarted: (callback: IpcCallback) =>
    ipcRenderer.on("docker-recovery-started", callback),
  onDockerRecoveryReady: (callback: IpcCallback) =>
    ipcRenderer.on("docker-recovery-ready", callback),
  onDockerRecoveryCancelled: (callback: IpcCallback) =>
    ipcRenderer.on("docker-recovery-cancelled", callback),
});
