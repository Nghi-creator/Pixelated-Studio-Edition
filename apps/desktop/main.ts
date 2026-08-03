import { app, BrowserWindow } from "electron";
import path from "path";
import {
  DESKTOP_PROTOCOL,
  findSupportedDesktopDeepLink,
  isSupportedDesktopDeepLink,
} from "./main/deepLink";
import { cleanupEngine } from "./main/engine/controller";
import { registerIpcHandlers } from "./main/ipc";
import { createShutdownCoordinator } from "./main/shutdown";

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    showMainWindow();
    return;
  }

  mainWindow = new BrowserWindow({
    width: 600,
    height: 700,
    minWidth: 390,
    backgroundColor: "#0B0F19",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event) => {
    event.preventDefault();
  });
  mainWindow.loadFile(path.join(__dirname, "../index.html"));
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    if (app.isReady()) createWindow();
    return;
  }

  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function registerDesktopProtocol() {
  if (process.defaultApp && process.argv[1]) {
    return app.setAsDefaultProtocolClient(DESKTOP_PROTOCOL, process.execPath, [
      path.resolve(process.argv[1]),
    ]);
  }
  return app.setAsDefaultProtocolClient(DESKTOP_PROTOCOL);
}

const shutdownCoordinator = createShutdownCoordinator(cleanupEngine, () =>
  app.quit(),
);

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  registerIpcHandlers();

  app.on("second-instance", (_event, argv) => {
    // A normal second launch should focus the app too. Deep-link arguments are
    // parsed only to keep future actions on an explicit allowlist.
    const containsDesktopLink = argv.some((argument) =>
      argument.toLowerCase().startsWith(`${DESKTOP_PROTOCOL}:`),
    );
    if (!containsDesktopLink || findSupportedDesktopDeepLink(argv)) {
      showMainWindow();
    }
  });

  app.on("open-url", (event, url) => {
    event.preventDefault();
    if (isSupportedDesktopDeepLink(url)) showMainWindow();
  });

  app.whenReady().then(() => {
    registerDesktopProtocol();
    createWindow();
  });

  app.on("before-quit", (event) => {
    shutdownCoordinator.handleBeforeQuit(event);
  });

  app.on("window-all-closed", () => app.quit());
}
