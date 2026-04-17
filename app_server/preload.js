const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  startDocker: () => ipcRenderer.send("start-docker"),
  stopDocker: () => ipcRenderer.send("stop-docker"),
  onServerLog: (callback) => ipcRenderer.on("server-log", callback),
  onEngineStopped: (callback) => ipcRenderer.on("engine-stopped", callback)
});
