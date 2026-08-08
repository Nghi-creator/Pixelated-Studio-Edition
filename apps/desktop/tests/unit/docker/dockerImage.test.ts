import assert from "node:assert/strict";
import test from "node:test";
import type { IpcMainEvent } from "electron";
import { prepareEngineImage } from "../../../main/docker/client";
import type { EngineRuntimeConfig } from "../../../main/runtime/config";

const runtimeConfig: EngineRuntimeConfig = {
  defaultEngineImage: "pixelated-engine",
  engineFingerprint: "a".repeat(64),
  engineImage: "pixelated-engine",
  engineRuntimeKind: "libretro",
  nativeRuntimeLock: null,
  pullEngineImage: false,
};

function createEvent() {
  const logs: string[] = [];
  return {
    event: {
      reply(channel: string, message: unknown) {
        if (channel === "server-log") logs.push(String(message));
      },
    } as unknown as IpcMainEvent,
    logs,
  };
}

test("matching engine fingerprints reuse the cached Docker image", async () => {
  const { event, logs } = createEvent();
  let commandCount = 0;

  await prepareEngineImage(event, {}, runtimeConfig, {
    readImageFingerprint: async () => runtimeConfig.engineFingerprint,
    runCommand: async () => {
      commandCount += 1;
    },
  });

  assert.equal(commandCount, 0);
  assert.deepEqual(logs, ["Reusing cached engine image: pixelated-engine"]);
});

test("changed engine fingerprints rebuild and label the Docker image", async () => {
  const { event } = createEvent();
  const commands: string[][] = [];

  await prepareEngineImage(event, {}, runtimeConfig, {
    readImageFingerprint: async () => "old-fingerprint",
    runCommand: async (_event, command, args) => {
      assert.equal(command, "docker");
      commands.push(args);
    },
  });

  assert.equal(commands.length, 1);
  assert.deepEqual(commands[0], [
    "build",
    "--label",
    `com.pixelated.runtime.fingerprint=${runtimeConfig.engineFingerprint}`,
    "-t",
    "pixelated-engine",
    ".",
  ]);
});

test("explicit image recovery rebuilds even when the fingerprint matches", async () => {
  const { event } = createEvent();
  const commands: string[][] = [];

  await prepareEngineImage(
    event,
    {},
    runtimeConfig,
    {
      readImageFingerprint: async () => runtimeConfig.engineFingerprint,
      runCommand: async (_event, _command, args) => {
        commands.push(args);
      },
    },
    true,
  );

  assert.equal(commands.length, 1);
  assert.equal(commands[0]?.[0], "build");
});
