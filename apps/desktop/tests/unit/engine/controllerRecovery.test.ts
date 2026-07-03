import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import type { IpcMainEvent } from "electron";
import { createDockerDiagnostic } from "../../../main/docker/diagnostics";
import type { EngineRuntimeConfig } from "../../../main/runtime/config";
import {
  buildEngineImageAndResume,
  resetEngineControllerForTest,
  startEngine,
} from "../../../main/engine/controller";

type Reply = {
  channel: string;
  payload: unknown[];
};

function createEvent() {
  const replies: Reply[] = [];
  return {
    event: {
      reply: (channel: string, ...payload: unknown[]) => {
        replies.push({ channel, payload });
      },
    } as unknown as IpcMainEvent,
    replies,
  };
}

function waitForReply(replies: Reply[], channel: string) {
  return new Promise<Reply>((resolve, reject) => {
    const deadline = Date.now() + 500;
    const poll = () => {
      const reply = replies.find((entry) => entry.channel === channel);
      if (reply) {
        resolve(reply);
        return;
      }
      if (Date.now() > deadline) {
        reject(new Error(`Timed out waiting for ${channel}`));
        return;
      }
      setTimeout(poll, 0);
    };
    poll();
  });
}

afterEach(() => {
  resetEngineControllerForTest();
});

describe("desktop engine image recovery", () => {
  it("emits image-recovery payloads when image preparation fails", async () => {
    const { event, replies } = createEvent();
    resetEngineControllerForTest({
      diagnoseDocker: async () => createDockerDiagnostic("ready"),
      getSafeEnv: () => ({}),
      prepareEngineImage: async () => {
        throw new Error("missing runtime Dockerfile");
      },
      stopCompanionServer: () => undefined,
    });

    startEngine(event);

    const recovery = await waitForReply(replies, "engine-image-recovery");
    const payload = recovery.payload[0] as {
      detail: string;
      engineImage: string;
      guidance: string;
      runtimeKind: string;
      summary: string;
      title: string;
    };

    assert.equal(payload.title, "Engine image is not ready");
    assert.equal(payload.engineImage, "pixelated-engine");
    assert.equal(payload.runtimeKind, "libretro");
    assert.equal(payload.detail, "missing runtime Dockerfile");
    assert.match(payload.guidance, /Build the local libretro Docker image/);
    assert.match(payload.summary, /missing runtime Dockerfile/);
    assert.ok(
      replies.some(
        (reply) =>
          reply.channel === "engine-state" &&
          (reply.payload[0] as { status?: string }).status === "failed",
      ),
    );
    assert.ok(replies.some((reply) => reply.channel === "engine-stopped"));
  });

  it("resumes startup after a successful image rebuild without rebuilding twice", async () => {
    const { event, replies } = createEvent();
    const preparedImages: EngineRuntimeConfig[] = [];
    const dockerCommands: string[][] = [];

    resetEngineControllerForTest({
      diagnoseDocker: async () => createDockerDiagnostic("ready"),
      execFileCommand: async (_command, args) => {
        dockerCommands.push(args);
        return { stderr: "", stdout: "" };
      },
      getSafeEnv: () => ({}),
      getUserDataPath: () => "/tmp/pixelated-desktop-test",
      prepareEngineImage: async (_event, _safeEnv, runtimeConfig) => {
        preparedImages.push(runtimeConfig!);
      },
      startCompanionServer: async () => ({
        certPath: "/tmp/pixelated-desktop-test/cert.pem",
        httpPort: 8091,
        keyPath: "/tmp/pixelated-desktop-test/key.pem",
        port: 8090,
      }),
      stopCompanionServer: () => undefined,
      waitForEngineHealth: async () => undefined,
    });

    buildEngineImageAndResume(event);

    await waitForReply(replies, "engine-image-build-ready");
    await waitForReply(replies, "engine-token");

    assert.equal(preparedImages.length, 1);
    assert.equal(preparedImages[0]?.engineImage, "pixelated-engine");
    assert.ok(replies.some((reply) => reply.channel === "engine-image-build-started"));
    assert.ok(
      replies.some(
        (reply) =>
          reply.channel === "engine-state" &&
          (reply.payload[0] as { status?: string }).status === "ready",
      ),
    );
    assert.ok(
      replies.some(
        (reply) =>
          reply.channel === "engine-exposure" &&
          (reply.payload[0] as { exposureMode?: string }).exposureMode === "local",
      ),
    );
    assert.equal(dockerCommands.length, 2);
  });
});
