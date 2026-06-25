import fs from "fs";
import { createResourceSnapshot } from "./resourceSnapshot";

type ProcessRef = {
  exitCode?: number | null;
  pid?: number | null;
} | null | undefined;

type RuntimeState = {
  activeCloudRomPath?: string | null;
  activeSessionId?: string | null;
  cameraPeerStatePath?: string | null;
  cameraProcess?: ProcessRef;
  gamepads?: Record<string, unknown>;
  pulseAudioProcess?: ProcessRef;
  retroarchProcess?: ProcessRef;
  virtualDisplayProcess?: ProcessRef;
};

type HealthPaths = {
  cameraBridge: string;
  cameraPeerState: string;
  gamepadBridge: string;
  gstreamerBinary: string;
  libretroCores: string[];
  pythonBinary: string;
  retroarchBinary: string;
  retroarchConfig: string;
  roms: string;
  xvfbSocket: string;
};

type HealthSnapshotOptions = {
  advertisedUrls?: string[];
  companionUrls?: string[];
  engineToken?: string;
  exposureMode?: "local" | "lan";
  getRuntimeState: () => RuntimeState;
  healthPaths: HealthPaths;
};

function pathExists(filePath: string): boolean {
  return fs.existsSync(filePath);
}

function canWriteDirectory(dirPath: string): boolean {
  try {
    fs.accessSync(dirPath, fs.constants.W_OK);
    return true;
  } catch (err) {
    return false;
  }
}

function processStarted(processRef: ProcessRef): boolean {
  return (
    Boolean(processRef) &&
    (processRef?.exitCode === null || processRef?.exitCode === 0)
  );
}

export function createHealthSnapshot(options: HealthSnapshotOptions) {
  const {
    advertisedUrls = [],
    companionUrls = [],
    engineToken,
    exposureMode = "local",
    healthPaths,
    getRuntimeState,
  } = options;

  return function getHealthSnapshot() {
    const runtimeState = getRuntimeState();
    const checks = {
      node: true,
      virtualDisplay: {
        processStarted: processStarted(runtimeState.virtualDisplayProcess),
        socketReady: pathExists(healthPaths.xvfbSocket),
      },
      audio: {
        processStarted: processStarted(runtimeState.pulseAudioProcess),
      },
      retroarch: {
        binaryExists: pathExists(healthPaths.retroarchBinary),
        libretroCoresExist: healthPaths.libretroCores.every(pathExists),
        configExists: pathExists(healthPaths.retroarchConfig),
      },
      cameraBridge: {
        fileExists: pathExists(healthPaths.cameraBridge),
        pythonExists: pathExists(healthPaths.pythonBinary),
        gstreamerExists: pathExists(healthPaths.gstreamerBinary),
      },
      gamepadBridge: {
        fileExists: pathExists(healthPaths.gamepadBridge),
        ...runtimeState.gamepads,
      },
      storage: {
        romsDirectoryExists: pathExists(healthPaths.roms),
        romsDirectoryWritable: canWriteDirectory(healthPaths.roms),
      },
      runtime: {
        activeSessionId: runtimeState.activeSessionId,
        retroarchRunning: Boolean(
          runtimeState.retroarchProcess &&
            runtimeState.retroarchProcess.exitCode === null,
        ),
        cameraRunning: Boolean(
          runtimeState.cameraProcess &&
            runtimeState.cameraProcess.exitCode === null,
        ),
        activeCloudRomPath: runtimeState.activeCloudRomPath,
      },
      resources: createResourceSnapshot(runtimeState),
    };

    const ok =
      checks.node &&
      checks.virtualDisplay.processStarted &&
      checks.virtualDisplay.socketReady &&
      checks.audio.processStarted &&
      checks.retroarch.binaryExists &&
      checks.retroarch.libretroCoresExist &&
      checks.retroarch.configExists &&
      checks.cameraBridge.fileExists &&
      checks.cameraBridge.pythonExists &&
      checks.cameraBridge.gstreamerExists &&
      checks.storage.romsDirectoryExists &&
      checks.storage.romsDirectoryWritable;

    return {
      ok,
      advertisedUrls,
      companionUrls,
      exposureMode,
      uptime: process.uptime(),
      engineTokenRequired: Boolean(engineToken),
      checks,
    };
  };
}
