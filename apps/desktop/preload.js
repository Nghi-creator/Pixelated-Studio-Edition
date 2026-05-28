const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  startDocker: (options) => ipcRenderer.send("start-docker", options),
  stopDocker: () => ipcRenderer.send("stop-docker"),
  onServerLog: (callback) => ipcRenderer.on("server-log", callback),
  onEngineState: (callback) => ipcRenderer.on("engine-state", callback),
  onEngineStopped: (callback) => ipcRenderer.on("engine-stopped", callback),
  onEngineToken: (callback) => ipcRenderer.on("engine-token", callback),
  onEngineExposure: (callback) => ipcRenderer.on("engine-exposure", callback),
  onEngineCompanion: (callback) => ipcRenderer.on("engine-companion", callback),
});
