import {
  execFile,
  spawn,
  type ExecFileOptions,
  type SpawnOptions,
} from "child_process";
import type { IpcMainEvent } from "electron";
import fs from "fs";
import {
  buildFallback,
  engineImage,
  engineRuntimeDir,
  pullEngineImage,
} from "./config";
import { emitEngineState } from "./state";

type ExecCommandResult = {
  stderr: string;
  stdout: string;
};

export function getSafeEnv() {
  if (process.platform === "win32") {
    return process.env;
  }

  return {
    ...process.env,
    PATH: `${process.env.PATH}:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin`,
  };
}

export function isSafeDockerImageRef(value: string) {
  return /^[a-zA-Z0-9][a-zA-Z0-9._/-]*(?::[a-zA-Z0-9._-]+)?$/.test(value);
}

function streamFile(
  event: IpcMainEvent,
  command: string,
  args: string[],
  options: SpawnOptions,
) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, options);

    child.stdout?.on("data", (data) =>
      event.reply("server-log", data.toString().trim()),
    );
    child.stderr?.on("data", (data) =>
      event.reply("server-log", data.toString().trim()),
    );
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Command failed with exit code ${code}`));
    });
  });
}

export function execFileCommand(
  command: string,
  args: string[],
  options: ExecFileOptions,
) {
  return new Promise<ExecCommandResult>((resolve, reject) => {
    execFile(command, args, options, (err, stdout, stderr) => {
      if (err) {
        reject(err);
        return;
      }
      resolve({ stderr: String(stderr), stdout: String(stdout) });
    });
  });
}

export async function prepareEngineImage(
  event: IpcMainEvent,
  safeEnv: NodeJS.ProcessEnv,
) {
  if (!isSafeDockerImageRef(engineImage)) {
    throw new Error("Invalid PIXELATED_ENGINE_IMAGE value.");
  }

  if (pullEngineImage) {
    emitEngineState(event, "PULLING_IMAGE", engineImage);
    event.reply("server-log", `Pulling engine image: ${engineImage}`);
    try {
      await streamFile(event, "docker", ["pull", engineImage], { env: safeEnv });
      return;
    } catch (err) {
      if (!buildFallback) throw err;
      event.reply(
        "server-log",
        "Pull failed. Falling back to local engine image build.",
      );
    }
  }

  emitEngineState(event, "BUILDING_IMAGE", engineRuntimeDir);
  event.reply("server-log", "Building local engine image...");
  await streamFile(event, "docker", ["build", "-t", engineImage, "."], {
    cwd: engineRuntimeDir,
    env: safeEnv,
  });
}

export const hasHostUinput = () => fs.existsSync("/dev/uinput");
