import { spawn, type ChildProcessWithoutNullStreams } from "child_process";

export type KeyAction = "keydown" | "keyup";

type KeyboardBridgeOptions = {
  keyboardBridgePath: string;
  spawnProcess?: typeof spawn;
};

export type KeyboardBridgeState = {
  enabled: boolean;
  failed: boolean;
  ready: boolean;
};

export function createKeyboardBridge({
  keyboardBridgePath,
  spawnProcess = spawn,
}: KeyboardBridgeOptions) {
  let bridgeProcess: ChildProcessWithoutNullStreams | null = null;
  let ready = false;
  let failed = false;

  function start(): void {
    if (bridgeProcess || failed) return;

    bridgeProcess = spawnProcess("python3", ["-u", keyboardBridgePath], {
      env: { ...process.env, DISPLAY: ":99" },
      stdio: ["pipe", "pipe", "pipe"],
    }) as ChildProcessWithoutNullStreams;

    bridgeProcess.stdout.on("data", (data: Buffer) => {
      const message = data.toString().trim();
      if (message.includes("[Keyboard] ready")) ready = true;
      if (message) console.log(message);
    });

    bridgeProcess.stderr.on("data", (data: Buffer) =>
      console.error(`[Keyboard Error] ${data}`),
    );

    bridgeProcess.on("error", (error) => {
      console.error(`[Keyboard] bridge failed to start: ${error.message}`);
      bridgeProcess = null;
      ready = false;
      failed = true;
    });

    bridgeProcess.on("exit", (code) => {
      console.warn(`[Keyboard] bridge exited with code ${code}`);
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

  function sendInput(action: KeyAction, linuxKey: string): boolean {
    if (!bridgeProcess || !bridgeProcess.stdin.writable) return false;

    bridgeProcess.stdin.write(
      `${JSON.stringify({ action, key: linuxKey })}\n`,
    );
    return true;
  }

  function getState(): KeyboardBridgeState {
    return {
      enabled: Boolean(bridgeProcess),
      failed,
      ready,
    };
  }

  return {
    getState,
    sendInput,
    start,
    stop,
  };
}
