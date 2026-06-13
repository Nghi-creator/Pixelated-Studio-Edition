import { execFile } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import {
  createDockerDiagnostic,
  diagnoseDocker,
  type DockerDiagnostic,
} from "./dockerDiagnostics";

export type DockerStartPlan =
  | { kind: "open-path"; path: string }
  | { args: string[]; command: string; kind: "exec-file" };

const RESTART_RECOVERABLE_CODES = new Set([
  "daemon_stopped",
  "permission_denied",
  "startup_timeout",
  "unknown",
]);

type WaitForDockerOptions = {
  diagnose?: (env: NodeJS.ProcessEnv) => Promise<DockerDiagnostic>;
  intervalMs?: number;
  isCancelled?: () => boolean;
  sleep?: (delayMs: number) => Promise<void>;
  timeoutMs?: number;
};

const DEFAULT_READY_TIMEOUT_MS = 90_000;
const DEFAULT_READY_INTERVAL_MS = 2_000;

export function getTrustedDockerDesktopCandidates(
  platform: NodeJS.Platform,
  homeDir = os.homedir(),
  env: NodeJS.ProcessEnv = process.env,
) {
  if (platform === "darwin") {
    return [
      "/Applications/Docker.app",
      path.join(homeDir, "Applications", "Docker.app"),
    ];
  }
  if (platform === "win32") {
    return [
      env.ProgramFiles
        ? path.join(
            env.ProgramFiles,
            "Docker",
            "Docker",
            "Docker Desktop.exe",
          )
        : "",
      env.LOCALAPPDATA
        ? path.join(env.LOCALAPPDATA, "Docker", "Docker Desktop.exe")
        : "",
    ].filter(Boolean);
  }
  return ["/opt/docker-desktop/bin/docker-desktop"];
}

export function discoverDockerStartPlan(
  platform: NodeJS.Platform = process.platform,
  exists: (candidate: string) => boolean = fs.existsSync,
  homeDir = os.homedir(),
  env: NodeJS.ProcessEnv = process.env,
): DockerStartPlan | null {
  const desktopPath = getTrustedDockerDesktopCandidates(
    platform,
    homeDir,
    env,
  ).find(exists);

  if (desktopPath) {
    return { kind: "open-path", path: desktopPath };
  }
  if (platform === "linux" && exists("/usr/bin/systemctl")) {
    return {
      args: ["--user", "start", "docker-desktop"],
      command: "/usr/bin/systemctl",
      kind: "exec-file",
    };
  }
  return null;
}

export function withDockerStartCapability(
  diagnostic: DockerDiagnostic,
  startPlan: DockerStartPlan | null = discoverDockerStartPlan(),
): DockerDiagnostic {
  return {
    ...diagnostic,
    canStartDocker:
      Boolean(startPlan) && RESTART_RECOVERABLE_CODES.has(diagnostic.code),
  };
}

export function executeDockerStartPlan(
  plan: DockerStartPlan,
  openPath: (targetPath: string) => Promise<string>,
) {
  if (plan.kind === "open-path") {
    return openPath(plan.path).then((errorMessage) => {
      if (errorMessage) throw new Error(errorMessage);
    });
  }

  return new Promise<void>((resolve, reject) => {
    execFile(
      plan.command,
      plan.args,
      { timeout: 15_000, windowsHide: true },
      (error) => {
        if (error) reject(error);
        else resolve();
      },
    );
  });
}

export async function waitForDockerReady(
  env: NodeJS.ProcessEnv,
  options: WaitForDockerOptions = {},
) {
  const diagnose = options.diagnose || ((safeEnv) => diagnoseDocker(safeEnv));
  const intervalMs = options.intervalMs ?? DEFAULT_READY_INTERVAL_MS;
  const isCancelled = options.isCancelled || (() => false);
  const sleep =
    options.sleep ||
    ((delayMs) => new Promise<void>((resolve) => setTimeout(resolve, delayMs)));
  const timeoutMs = options.timeoutMs ?? DEFAULT_READY_TIMEOUT_MS;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (isCancelled()) return createDockerDiagnostic("unknown", "Cancelled");

    const diagnostic = await diagnose(env);
    if (diagnostic.code === "ready") return diagnostic;
    if (
      diagnostic.code !== "daemon_stopped" &&
      diagnostic.code !== "startup_timeout"
    ) {
      return diagnostic;
    }

    await sleep(intervalMs);
  }

  return createDockerDiagnostic(
    "startup_timeout",
    `Docker did not become ready within ${Math.ceil(timeoutMs / 1000)} seconds.`,
  );
}
