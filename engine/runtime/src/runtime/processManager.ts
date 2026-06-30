import { spawn, type ChildProcess } from "child_process";
import fs from "fs";
import { createGamepadBridge } from "../input/gamepadBridge";
import { injectKey, type KeyAction } from "../input/injectKey";
import { translateKey } from "../input/translateKey";
import { removeFileIfExists } from "../roms/cloudRomDownloader";
import type { StreamProfile } from "../signaling/startGameHandlers";
import { launchCameraBridge } from "./cameraLauncher";
import { launchLibretroGame } from "./libretroLauncher";
import { launchNativeGame } from "./nativeLauncher";
import { bindManagedProcessLifecycle } from "./processLifecycle";
import { startRuntimeHostProcesses } from "./runtimeHostProcesses";
import { getRuntimeDefinition } from "./runtimeRegistry";

type IceServer = {
  credential?: string;
  urls: string | string[];
  username?: string;
};

type ProcessManagerOptions = {
  cameraPath: string;
  cameraPeerStatePath: string;
  engineToken: string;
  fileExists?: (path: string) => boolean;
  gamepadBridgePath: string;
  spawnProcess?: typeof spawn;
};

type BootOptions = {
  iceServers?: IceServer[];
  isCloudRom?: boolean;
  runtimeId?: string;
  streamProfile?: StreamProfile;
};

type LaunchFailure = {
  exitCode?: number | null;
  label: string;
  message: string;
  occurredAt: string;
  runtimeId: string;
  sessionId: string;
  signal?: NodeJS.Signals | null;
  stderrTail?: string;
  stdoutTail?: string;
};

type RuntimeState = {
  activeCloudRomPath: string | null;
  activeSessionId: string | null;
  cameraPeerStatePath: string;
  cameraProcess: ChildProcess | null;
  gamepads: ReturnType<ReturnType<typeof createGamepadBridge>["getState"]>;
  lastLaunchFailure: LaunchFailure | null;
  pulseAudioProcess: ChildProcess | null;
  retroarchProcess: ChildProcess | null;
  virtualDisplayProcess: ChildProcess | null;
};

export function createProcessManager(options: ProcessManagerOptions) {
  const { cameraPath, cameraPeerStatePath, engineToken, gamepadBridgePath } =
    options;
  const fileExists = options.fileExists || fs.existsSync;
  const spawnProcess = options.spawnProcess || spawn;
  const gamepads = createGamepadBridge({ gamepadBridgePath });
  let retroarchProcess: ChildProcess | null = null;
  let cameraProcess: ChildProcess | null = null;
  let pulseAudioProcess: ChildProcess | null = null;
  let virtualDisplayProcess: ChildProcess | null = null;
  let activeSessionId: string | null = null;
  let activeCloudRomPath: string | null = null;
  let cameraStartTimer: NodeJS.Timeout | null = null;
  let lastLaunchFailure: LaunchFailure | null = null;

  function startVirtualDisplay(): void {
    const hostProcesses = startRuntimeHostProcesses(spawnProcess);
    virtualDisplayProcess = hostProcesses.virtualDisplayProcess;
    pulseAudioProcess = hostProcesses.pulseAudioProcess;
    gamepads.start();
  }

  function cleanupActiveSession(sessionId?: string | null): void {
    if (sessionId && activeSessionId && sessionId !== activeSessionId) return;

    if (cameraStartTimer) {
      clearTimeout(cameraStartTimer);
      cameraStartTimer = null;
    }

    if (retroarchProcess) {
      retroarchProcess.kill();
      retroarchProcess = null;
    }

    if (cameraProcess) {
      cameraProcess.kill();
      cameraProcess = null;
    }

    if (activeCloudRomPath) {
      removeFileIfExists(activeCloudRomPath);
      activeCloudRomPath = null;
    }

    activeSessionId = null;
  }

  function bindGameProcessLifecycle(
    child: ChildProcess,
    sessionId: string,
    label: string,
    runtimeId: string,
  ) {
    bindManagedProcessLifecycle({
      child,
      getActiveSessionId: () => activeSessionId,
      label,
      onCleanupSession: cleanupActiveSession,
      onLaunchFailure: recordLaunchFailure,
      runtimeId,
      sessionId,
    });
  }

  function recordLaunchFailure(
    failure: Omit<LaunchFailure, "occurredAt">,
  ): void {
    lastLaunchFailure = {
      ...failure,
      occurredAt: new Date().toISOString(),
    };
  }

  function sendInput(
    action: KeyAction,
    browserKey: unknown,
    playerIndex: number,
  ): boolean {
    if (gamepads.sendInput(action, browserKey, playerIndex)) return true;

    if (playerIndex > 2) return false;

    const linuxKey = translateKey(browserKey, playerIndex);
    if (!linuxKey) return true;

    injectKey(action, linuxKey);
    return true;
  }

  function bootGame(
    absoluteRomPath: string,
    sessionId: string,
    bootOptions: BootOptions = {},
  ): void {
    const runtimeId = bootOptions.runtimeId || "mesen";
    const runtime = getRuntimeDefinition(runtimeId);
    if (!runtime) {
      throw new Error(`Unsupported runtime: ${runtimeId}`);
    }

    cleanupActiveSession(activeSessionId);
    lastLaunchFailure = null;

    const launch =
      runtime.kind === "libretro"
        ? launchLibretroGame({
            absoluteRomPath,
            isCloudRom: bootOptions.isCloudRom,
            runtime,
            runtimeId,
            sessionId,
            spawnProcess,
          })
        : launchNativeGame({
            fileExists,
            launchManifestId: absoluteRomPath,
            runtime,
            sessionId,
            spawnProcess,
          });

    activeSessionId = sessionId;
    activeCloudRomPath = launch.activeCloudRomPath;
    retroarchProcess = launch.child;
    bindGameProcessLifecycle(retroarchProcess, sessionId, launch.label, runtimeId);

    cameraStartTimer = setTimeout(() => {
      cameraStartTimer = null;
      if (activeSessionId !== sessionId || !retroarchProcess) return;
      cameraProcess = launchCameraBridge({
        cameraPath,
        cameraPeerStatePath,
        engineToken,
        iceServers: bootOptions.iceServers,
        sessionId,
        spawnProcess,
        streamProfile: bootOptions.streamProfile,
      });

      bindGameProcessLifecycle(cameraProcess, sessionId, "Camera bridge", runtimeId);
    }, 1000);
  }

  function getActiveSessionId(): string | null {
    return activeSessionId;
  }

  function getRuntimeState(): RuntimeState {
    return {
      activeCloudRomPath,
      activeSessionId,
      cameraProcess,
      pulseAudioProcess,
      retroarchProcess,
      virtualDisplayProcess,
      gamepads: gamepads.getState(),
      cameraPeerStatePath,
      lastLaunchFailure,
    };
  }

  return {
    bootGame,
    cleanupActiveSession,
    getActiveSessionId,
    getRuntimeState,
    sendInput,
    startVirtualDisplay,
  };
}
