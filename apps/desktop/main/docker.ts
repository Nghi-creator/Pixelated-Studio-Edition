import { exec, type ExecOptions } from "child_process";
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

export function quoteDockerEnvValue(value: unknown) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\$/g, "\\$")
    .replace(/`/g, "\\`");
}

export function isSafeDockerImageRef(value: string) {
  return /^[a-zA-Z0-9][a-zA-Z0-9._/-]*(?::[a-zA-Z0-9._-]+)?$/.test(value);
}

function streamCommand(event: IpcMainEvent, command: string, options: ExecOptions) {
  return new Promise<void>((resolve, reject) => {
    const child = exec(command, options);

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

export function execCommand(command: string, options: ExecOptions) {
  return new Promise<ExecCommandResult>((resolve, reject) => {
    exec(command, options, (err, stdout, stderr) => {
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
      await streamCommand(event, `docker pull ${engineImage}`, { env: safeEnv });
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
  await streamCommand(event, `docker build -t ${engineImage} .`, {
    cwd: engineRuntimeDir,
    env: safeEnv,
  });
}

export {
  exec,
};

export const hasHostUinput = () => fs.existsSync("/dev/uinput");
