import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createProcessManager } from "../../src/runtime/processes/processManager";
import { RETROARCH_CONFIG_PATH } from "../../src/runtime/runtimePaths";

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

function writeTempFile(filename: string, bytes: Buffer) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pixelated-runtime-"));
  const filePath = path.join(tempDir, filename);
  fs.writeFileSync(filePath, bytes);
  return filePath;
}

function writeValidNesFile() {
  return writeTempFile(
    "game.nes",
    Buffer.concat([Buffer.from([0x4e, 0x45, 0x53, 0x1a]), Buffer.alloc(32)]),
  );
}

test("libretro boot validates artifacts before spawning RetroArch", () => {
  const { manager, spawned } = createManager();
  const invalidRomPath = writeTempFile("broken.nes", Buffer.alloc(32));

  assert.throws(
    () =>
      manager.bootGame(invalidRomPath, "session-invalid", {
        runtimeId: "mesen",
      }),
    /Invalid NES ROM header/,
  );

  assert.equal(manager.getActiveSessionId(), null);
  assert.deepEqual(spawned, []);
});

test("libretro boot uses the selected registry core", () => {
  const { manager, spawned } = createManager();
  const romPath = writeValidNesFile();

  manager.bootGame(romPath, "session-nes", {
    runtimeId: "mesen",
  });

  assert.equal(manager.getActiveSessionId(), "session-nes");
  assert.equal(spawned[0]?.command, "retroarch");
  assert.deepEqual(spawned[0]?.args.slice(0, 4), [
    "-f",
    "-L",
    "/cores/mesen_libretro.so",
    "--appendconfig",
  ]);
  assert.equal(spawned[0]?.args[4], RETROARCH_CONFIG_PATH);
  assert.equal(RETROARCH_CONFIG_PATH, "/home/pixelated/retroarch.cfg");

  manager.cleanupActiveSession("session-nes");
});

test("stream restart relaunches only the camera bridge", () => {
  const { manager, spawned } = createManager();
  const romPath = writeValidNesFile();

  manager.bootGame(romPath, "session-nes", {
    runtimeId: "mesen",
    streamProfile: { bitrateKbps: 1000, fps: 60, id: "balanced" },
  });
  manager.restartStream("session-nes", {
    streamProfile: { bitrateKbps: 700, fps: 30, id: "performance" },
  });

  assert.equal(manager.getActiveSessionId(), "session-nes");
  assert.equal(spawned.filter((entry) => entry.command === "retroarch").length, 1);
  assert.equal(spawned.filter((entry) => entry.command === "python3").length, 1);

  manager.cleanupActiveSession("session-nes");
});

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

test("native process failures expose recent launch diagnostics", () => {
  const child = new FakeChildProcess();
  const { manager } = createManager({ spawnChild: child });

  manager.bootGame("frozen-bubble", "session-native", {
    runtimeId: "debian-native-v1",
  });

  child.stderr.emit(
    "data",
    Buffer.from("failed to initialize SDL video output\n"),
  );
  child.emit("exit", 1, null);

  const failure = manager.getRuntimeState().lastLaunchFailure;
  assert.equal(failure?.sessionId, "session-native");
  assert.equal(failure?.runtimeId, "debian-native-v1");
  assert.equal(failure?.label, "Native game frozen-bubble");
  assert.equal(failure?.exitCode, 1);
  assert.match(failure?.stderrTail || "", /SDL video output/);
});
