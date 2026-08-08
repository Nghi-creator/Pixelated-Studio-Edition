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
  engineRuntimeDir,
  resolveEngineRuntimeConfig,
  type EngineRuntimeConfig,
} from "../runtime/config";
import { emitEngineState } from "../runtime/state";

type ExecCommandResult = {
  stderr: string;
  stdout: string;
};

const ENGINE_FINGERPRINT_LABEL = "com.pixelated.runtime.fingerprint";

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

async function readEngineImageFingerprint(
  engineImage: string,
  safeEnv: NodeJS.ProcessEnv,
) {
  try {
    const result = await execFileCommand(
      "docker",
      [
        "image",
        "inspect",
        "--format",
        `{{ index .Config.Labels "${ENGINE_FINGERPRINT_LABEL}" }}`,
        engineImage,
      ],
      { env: safeEnv },
    );
    const fingerprint = result.stdout.trim();
    return fingerprint && fingerprint !== "<no value>" ? fingerprint : null;
  } catch {
    return null;
  }
}

type PrepareEngineImageDependencies = {
  readImageFingerprint: typeof readEngineImageFingerprint;
  runCommand: typeof streamFile;
};

const defaultPrepareEngineImageDependencies: PrepareEngineImageDependencies = {
  readImageFingerprint: readEngineImageFingerprint,
  runCommand: streamFile,
};

export async function prepareEngineImage(
  event: IpcMainEvent,
  safeEnv: NodeJS.ProcessEnv,
  runtimeConfig: EngineRuntimeConfig = resolveEngineRuntimeConfig(),
  dependencies: PrepareEngineImageDependencies = defaultPrepareEngineImageDependencies,
  forceBuild = false,
) {
  const {
    engineImage,
    engineFingerprint,
    engineRuntimeKind,
    nativeRuntimeLock,
    pullEngineImage,
  } = runtimeConfig;

  if (!isSafeDockerImageRef(engineImage)) {
    throw new Error("Invalid PIXELATED_ENGINE_IMAGE value.");
  }

  if (pullEngineImage) {
    emitEngineState(event, "PULLING_IMAGE", engineImage);
    event.reply("server-log", `Pulling engine image: ${engineImage}`);
    try {
      await dependencies.runCommand(event, "docker", ["pull", engineImage], {
        env: safeEnv,
      });
      return;
    } catch (err) {
      if (!buildFallback) throw err;
      event.reply(
        "server-log",
        "Pull failed. Falling back to local engine image build.",
      );
    }
  }

  if (!forceBuild) {
    const existingFingerprint = await dependencies.readImageFingerprint(
      engineImage,
      safeEnv,
    );
    if (existingFingerprint === engineFingerprint) {
      event.reply("server-log", `Reusing cached engine image: ${engineImage}`);
      return;
    }
  }

  emitEngineState(event, "BUILDING_IMAGE", engineRuntimeDir);
  event.reply(
    "server-log",
    `Building local ${engineRuntimeKind === "native_linux" ? "native" : "libretro"} engine image...`,
  );
  const buildArgs =
    engineRuntimeKind === "native_linux"
      ? [
          "build",
          "--label",
          `${ENGINE_FINGERPRINT_LABEL}=${engineFingerprint}`,
          "-t",
          engineImage,
          "-f",
          "Dockerfile.native",
          "--build-arg",
          `NATIVE_RUNTIME_ID=${nativeRuntimeLock?.runtimeId || "debian-native-v1"}`,
          "--build-arg",
          `NATIVE_RUNTIME_LOCK_SHA256=${nativeRuntimeLock?.hash || "unknown"}`,
          ".",
        ]
      : [
          "build",
          "--label",
          `${ENGINE_FINGERPRINT_LABEL}=${engineFingerprint}`,
          "-t",
          engineImage,
          ".",
        ];

  await dependencies.runCommand(event, "docker", buildArgs, {
    cwd: engineRuntimeDir,
    env: safeEnv,
  });
}

export const hasHostUinput = () => fs.existsSync("/dev/uinput");

export function getHostUinputGroupId() {
  try {
    const groupId = fs.statSync("/dev/uinput").gid;
    return Number.isSafeInteger(groupId) && groupId >= 0 ? groupId : undefined;
  } catch {
    return undefined;
  }
}
