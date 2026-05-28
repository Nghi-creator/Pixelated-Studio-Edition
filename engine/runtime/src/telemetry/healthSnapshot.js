const fs = require("fs");

function pathExists(filePath) {
  return fs.existsSync(filePath);
}

function canWriteDirectory(dirPath) {
  try {
    fs.accessSync(dirPath, fs.constants.W_OK);
    return true;
  } catch (err) {
    return false;
  }
}

function processStarted(processRef) {
  return (
    Boolean(processRef) &&
    (processRef.exitCode === null || processRef.exitCode === 0)
  );
}

function createHealthSnapshot(options) {
  const {
    advertisedUrls = [],
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
        mesenCoreExists: pathExists(healthPaths.mesenCore),
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
    };

    const ok =
      checks.node &&
      checks.virtualDisplay.processStarted &&
      checks.virtualDisplay.socketReady &&
      checks.audio.processStarted &&
      checks.retroarch.binaryExists &&
      checks.retroarch.mesenCoreExists &&
      checks.retroarch.configExists &&
      checks.cameraBridge.fileExists &&
      checks.cameraBridge.pythonExists &&
      checks.cameraBridge.gstreamerExists &&
      checks.storage.romsDirectoryExists &&
      checks.storage.romsDirectoryWritable;

    return {
      ok,
      advertisedUrls,
      exposureMode,
      uptime: process.uptime(),
      engineTokenRequired: Boolean(engineToken),
      checks,
    };
  };
}

module.exports = { createHealthSnapshot };
