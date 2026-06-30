import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { createProcessManager } from "./processManager";

class FakeChildProcess extends EventEmitter {
  killed = false;
  stdout = new EventEmitter();
  stderr = new EventEmitter();

  kill() {
    this.killed = true;
    return true;
  }
}

function createManager(options: {
  fileExists?: (path: string) => boolean;
  spawned?: { args: string[]; command: string }[];
  spawnChild?: FakeChildProcess;
} = {}) {
  const child = options.spawnChild || new FakeChildProcess();
  const spawned = options.spawned || [];
  return {
    child,
    manager: createProcessManager({
      cameraPath: "/app/camera.py",
      cameraPeerStatePath: "/tmp/camera-peers.json",
      engineToken: "engine-token",
      fileExists: options.fileExists || (() => true),
      gamepadBridgePath: "/app/gamepadBridge",
      spawnProcess: ((command: string, args: string[] = []) => {
        spawned.push({ args, command });
        return child;
      }) as never,
    }),
    spawned,
  };
}

test("native boot fails fast when the allowlisted executable is missing", () => {
  const { manager, spawned } = createManager({
    fileExists: () => false,
  });

  assert.throws(
    () =>
      manager.bootGame("frozen-bubble", "session-native", {
        runtimeId: "debian-native-v1",
      }),
    /Native launch executable is missing: \/usr\/games\/frozen-bubble/,
  );
  assert.equal(manager.getActiveSessionId(), null);
  assert.deepEqual(spawned, []);
});

test("native process exit clears active session before camera startup", () => {
  const child = new FakeChildProcess();
  const { manager, spawned } = createManager({ spawnChild: child });

  manager.bootGame("frozen-bubble", "session-native", {
    runtimeId: "debian-native-v1",
  });
  assert.equal(manager.getActiveSessionId(), "session-native");
  assert.equal(spawned[0]?.command, "/usr/games/frozen-bubble");

  child.emit("exit", 1, null);

  assert.equal(manager.getActiveSessionId(), null);
  assert.equal(spawned.some((entry) => entry.command === "python3"), false);
});
