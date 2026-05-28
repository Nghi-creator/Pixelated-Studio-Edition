const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const {
  cleanupEngine,
  startEngine,
  stopEngine,
} = require("./main/engineController");

let mainWindow;

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
  mainWindow.loadFile("index.html");
}

ipcMain.on("start-docker", (event, options = {}) => {
  startEngine(event, options);
});

ipcMain.on("stop-docker", (event) => {
  stopEngine(event);
});

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  cleanupEngine();
  app.quit();
});
