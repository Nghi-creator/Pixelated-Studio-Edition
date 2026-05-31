import fs from "fs";
import { spawn, type ChildProcessWithoutNullStreams } from "child_process";
import { translateGamepadButton } from "./translateGamepadButton";
import type { KeyAction } from "./injectKey";

type GamepadBridgeOptions = {
  gamepadBridgePath: string;
};

export type GamepadBridgeState = {
  enabled: boolean;
  failed: boolean;
  ready: boolean;
  uinputAvailable: boolean;
};

export function createGamepadBridge({ gamepadBridgePath }: GamepadBridgeOptions) {
  let bridgeProcess: ChildProcessWithoutNullStreams | null = null;
  let ready = false;
  let failed = false;

  function start(): void {
    if (bridgeProcess || failed) return;

    if (!fs.existsSync("/dev/uinput")) {
      failed = true;
      console.warn(
        "[Gamepad] /dev/uinput is unavailable; using keyboard fallback.",
      );
      return;
    }

    bridgeProcess = spawn("python3", ["-u", gamepadBridgePath], {
      stdio: ["pipe", "pipe", "pipe"],
    }) as ChildProcessWithoutNullStreams;

    bridgeProcess.stdout.on("data", (data: Buffer) => {
      const message = data.toString().trim();
      if (message.includes("[Gamepad] ready")) ready = true;
      if (message) console.log(message);
    });

    bridgeProcess.stderr.on("data", (data: Buffer) =>
      console.error(`[Gamepad Error] ${data}`),
    );

    bridgeProcess.on("exit", (code) => {
      console.warn(`[Gamepad] bridge exited with code ${code}`);
      bridgeProcess = null;
      ready = false;
      failed = true;
    });
  }

  function stop(): void {
    if (!bridgeProcess) return;
    bridgeProcess.kill();
    bridgeProcess = null;
    ready = false;
  }

  function sendInput(
    action: KeyAction,
    browserKey: unknown,
    playerIndex: number,
  ): boolean {
    if (!bridgeProcess || !ready || !bridgeProcess.stdin.writable) {
      return false;
    }

    const button = translateGamepadButton(browserKey);
    if (!button) return true;

    bridgeProcess.stdin.write(
      `${JSON.stringify({ action, button, playerIndex })}\n`,
    );
    return true;
  }

  function getState(): GamepadBridgeState {
    return {
      enabled: Boolean(bridgeProcess),
      failed,
      ready,
      uinputAvailable: fs.existsSync("/dev/uinput"),
    };
  }

  return {
    getState,
    sendInput,
    start,
    stop,
  };
}
