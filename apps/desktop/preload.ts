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

type IpcCallback<TArgs extends unknown[] = []> = (
  event: IpcRendererEvent,
  ...args: TArgs
) => void;

contextBridge.exposeInMainWorld("electronAPI", {
  createCompanionQrDataUrl: (url: string) =>
    ipcRenderer.invoke("create-companion-qr", url) as Promise<string>,
  startDocker: (options: StartDockerOptions) =>
    ipcRenderer.send("start-docker", options),
  stopDocker: () => ipcRenderer.send("stop-docker"),
  regenerateLanInvite: () => ipcRenderer.send("regenerate-lan-invite"),
  revokeLanInvite: () => ipcRenderer.send("revoke-lan-invite"),
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
});
