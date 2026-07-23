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
  lastLaunchFailure?: Record<string, unknown> | null;
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

export type HealthSnapshotOptions = {
  advertisedUrls?: string[];
  companionUrls?: string[];
  engineToken?: string;
  exposureMode?: "local" | "lan";
  getRuntimeState: () => RuntimeState;
  healthPaths: HealthPaths;
  runtimeKind?: "libretro" | "native_linux";
};

type ReadinessChecks = {
  cameraBridgeReady: boolean;
  retroarchReady: boolean;
  storageReady: boolean;
};

type PublicHealthSnapshotOptions = {
  now?: () => number;
  readinessCacheTtlMs?: number;
};

const DEFAULT_READINESS_CACHE_TTL_MS = 5_000;

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

function getReadinessChecks(
  healthPaths: HealthPaths,
  runtimeKind: "libretro" | "native_linux",
): ReadinessChecks {
  return {
    cameraBridgeReady:
      pathExists(healthPaths.cameraBridge) &&
      pathExists(healthPaths.pythonBinary) &&
      pathExists(healthPaths.gstreamerBinary),
    retroarchReady:
      runtimeKind === "native_linux" ||
      (pathExists(healthPaths.retroarchBinary) &&
        healthPaths.libretroCores.every(pathExists) &&
        pathExists(healthPaths.retroarchConfig)),
    storageReady:
      pathExists(healthPaths.roms) && canWriteDirectory(healthPaths.roms),
  };
}

function readinessChecksPass(checks: ReadinessChecks) {
  return (
    checks.cameraBridgeReady && checks.retroarchReady && checks.storageReady
  );
}

export function createPublicHealthSnapshot(
  options: HealthSnapshotOptions,
  publicOptions: PublicHealthSnapshotOptions = {},
) {
  const {
    engineToken,
    exposureMode = "local",
    getRuntimeState,
    healthPaths,
    runtimeKind = "libretro",
  } = options;
  const now = publicOptions.now || Date.now;
  const readinessCacheTtlMs =
    publicOptions.readinessCacheTtlMs || DEFAULT_READINESS_CACHE_TTL_MS;
  let cachedReadiness: ReadinessChecks | null = null;
  let readinessExpiresAt = 0;

  return function getPublicHealthSnapshot() {
    const currentTime = now();
    const runtimeState = getRuntimeState();
    const readiness =
      cachedReadiness && currentTime < readinessExpiresAt
        ? cachedReadiness
        : getReadinessChecks(healthPaths, runtimeKind);
    if (readinessChecksPass(readiness)) {
      cachedReadiness = readiness;
      readinessExpiresAt = currentTime + readinessCacheTtlMs;
    } else {
      cachedReadiness = null;
    }

    const ok =
      readinessChecksPass(readiness) &&
      processStarted(runtimeState.virtualDisplayProcess) &&
      processStarted(runtimeState.pulseAudioProcess) &&
      pathExists(healthPaths.xvfbSocket);

    return {
      engineTokenRequired: Boolean(engineToken),
      exposureMode,
      ok,
      runtimeKind,
    };
  };
}

export function createHealthSnapshot(options: HealthSnapshotOptions) {
  const {
    advertisedUrls = [],
    companionUrls = [],
    engineToken,
    exposureMode = "local",
    healthPaths,
    getRuntimeState,
    runtimeKind = "libretro",
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
        lastLaunchFailure: runtimeState.lastLaunchFailure || null,
      },
      resources: createResourceSnapshot(runtimeState),
    };

    const runtimeBinariesReady =
      runtimeKind === "native_linux"
        ? true
        : checks.retroarch.binaryExists &&
          checks.retroarch.libretroCoresExist &&
          checks.retroarch.configExists;

    const ok =
      checks.node &&
      checks.virtualDisplay.processStarted &&
      checks.virtualDisplay.socketReady &&
      checks.audio.processStarted &&
      runtimeBinariesReady &&
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
      runtimeKind,
      uptime: process.uptime(),
      engineTokenRequired: Boolean(engineToken),
      checks,
    };
  };
}
