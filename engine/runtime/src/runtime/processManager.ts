import { spawn, type ChildProcess } from "child_process";
import fs from "fs";
import { createGamepadBridge } from "../input/gamepadBridge";
import { injectKey, type KeyAction } from "../input/injectKey";
import { translateKey } from "../input/translateKey";
import { removeFileIfExists } from "../roms/cloudRomDownloader";
import type { StreamProfile } from "../signaling/startGameHandlers";
import { getNativeLaunchManifest } from "./nativeLaunchManifests";
import { pulseAudioArgs } from "./processCommands";
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
  gamepadBridgePath: string;
};

type BootOptions = {
  iceServers?: IceServer[];
  isCloudRom?: boolean;
  runtimeId?: string;
  streamProfile?: StreamProfile;
};

type RuntimeState = {
  activeCloudRomPath: string | null;
  activeSessionId: string | null;
  cameraPeerStatePath: string;
  cameraProcess: ChildProcess | null;
  gamepads: ReturnType<ReturnType<typeof createGamepadBridge>["getState"]>;
  pulseAudioProcess: ChildProcess | null;
  retroarchProcess: ChildProcess | null;
  virtualDisplayProcess: ChildProcess | null;
};

export function createProcessManager(options: ProcessManagerOptions) {
  const { cameraPath, cameraPeerStatePath, engineToken, gamepadBridgePath } =
    options;
  const gamepads = createGamepadBridge({ gamepadBridgePath });
  let retroarchProcess: ChildProcess | null = null;
  let cameraProcess: ChildProcess | null = null;
  let pulseAudioProcess: ChildProcess | null = null;
  let virtualDisplayProcess: ChildProcess | null = null;
  let activeSessionId: string | null = null;
  let activeCloudRomPath: string | null = null;

  function startVirtualDisplay(): void {
    console.log("Booting Virtual Display (Xvfb) and PulseAudio...");

    if (fs.existsSync("/tmp/.X99-lock")) {
      fs.rmSync("/tmp/.X99-lock", { force: true });
    }
    if (fs.existsSync("/tmp/.X11-unix/X99")) {
      fs.rmSync("/tmp/.X11-unix/X99", { force: true, recursive: true });
    }

    virtualDisplayProcess = spawn("Xvfb", [
      ":99",
      "-screen",
      "0",
      "640x480x24",
    ]);
    pulseAudioProcess = spawn("pulseaudio", pulseAudioArgs);
    pulseAudioProcess.on("error", (err) => {
      console.error(`[Engine] PulseAudio failed to start: ${err.message}`);
    });

    fs.writeFileSync(
      "/app/retroarch.cfg",
      'audio_driver = "pulse"\n' +
        'audio_sync = "true"\n' +
        'video_vsync = "false"\n' +
        'input_driver = "udev"\n' +
        'joypad_driver = "udev"\n' +
        'input_autodetect_enable = "true"\n' +
        'input_libretro_device_p1 = "1"\n' +
        'input_libretro_device_p2 = "1"\n' +
        'input_libretro_device_p3 = "1"\n' +
        'input_libretro_device_p4 = "1"\n' +
        'input_player1_up = "up"\n' +
        'input_player1_down = "down"\n' +
        'input_player1_left = "left"\n' +
        'input_player1_right = "right"\n' +
        'input_player1_b = "z"\n' +
        'input_player1_a = "x"\n' +
        'input_player1_l = "a"\n' +
        'input_player1_r = "s"\n' +
        'input_player1_start = "enter"\n' +
        'input_player1_select = "rshift"\n' +
        'input_player2_up = "w"\n' +
        'input_player2_down = "s"\n' +
        'input_player2_left = "a"\n' +
        'input_player2_right = "d"\n' +
        'input_player2_b = "f"\n' +
        'input_player2_a = "g"\n' +
        'input_player2_l = "q"\n' +
        'input_player2_r = "e"\n' +
        'input_player2_start = "r"\n' +
        'input_player2_select = "t"\n',
    );
    gamepads.start();
  }

  function cleanupActiveSession(sessionId?: string | null): void {
    if (sessionId && activeSessionId && sessionId !== activeSessionId) return;

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

    if (retroarchProcess) retroarchProcess.kill();
    if (cameraProcess) cameraProcess.kill();
    if (activeCloudRomPath) removeFileIfExists(activeCloudRomPath);

    activeSessionId = sessionId;
    activeCloudRomPath = bootOptions.isCloudRom ? absoluteRomPath : null;

    if (runtime.kind === "libretro") {
      if (!runtime.corePath) {
        throw new Error(`Unsupported runtime: ${runtimeId}`);
      }

      console.log(
        `[Engine] Mounting ${runtime.id} content for session ${sessionId}: ${absoluteRomPath}`,
      );

      retroarchProcess = spawn(
        "retroarch",
        [
          "-f",
          "-L",
          runtime.corePath,
          "--appendconfig",
          "/app/retroarch.cfg",
          absoluteRomPath,
        ],
        { env: { ...process.env, DISPLAY: ":99", PULSE_SERVER: "127.0.0.1" } },
      );
    } else {
      const manifest = getNativeLaunchManifest(absoluteRomPath);
      if (!manifest || !runtime.launchManifestIds?.includes(manifest.id)) {
        throw new Error(`Unsupported native launch manifest: ${absoluteRomPath}`);
      }

      console.log(
        `[Engine] Launching native manifest ${manifest.id} for session ${sessionId}`,
      );

      retroarchProcess = spawn(manifest.executable, manifest.args, {
        env: {
          ...process.env,
          DISPLAY: ":99",
          PULSE_SERVER: "127.0.0.1",
          SDL_AUDIODRIVER: process.env.SDL_AUDIODRIVER || "dummy",
        },
      });
    }

    setTimeout(() => {
      console.log("[Engine] Starting Python WebRTC Camera Bridge...");
      cameraProcess = spawn("python3", ["-u", cameraPath], {
        env: {
          ...process.env,
          PULSE_SERVER: "127.0.0.1",
          PIXELATED_SESSION_ID: sessionId,
          PIXELATED_ENGINE_TOKEN: engineToken,
          PIXELATED_CAMERA_PEER_STATE_PATH: cameraPeerStatePath,
          PIXELATED_ICE_SERVERS: JSON.stringify(bootOptions.iceServers || []),
          PIXELATED_STREAM_PROFILE: JSON.stringify(
            bootOptions.streamProfile || {},
          ),
        },
      });

      cameraProcess.stdout?.on("data", (data: Buffer) =>
        console.log(`[Camera] ${data}`),
      );
      cameraProcess.stderr?.on("data", (data: Buffer) =>
        console.error(`[Camera Error] ${data}`),
      );
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
