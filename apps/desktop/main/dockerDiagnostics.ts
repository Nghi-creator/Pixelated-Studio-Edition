import { execFile, type ExecFileException } from "child_process";

export type DockerDiagnosticCode =
  | "ready"
  | "cli_missing"
  | "daemon_stopped"
  | "permission_denied"
  | "virtualization_unavailable"
  | "disk_full"
  | "context_invalid"
  | "startup_timeout"
  | "unknown";

export type DockerDiagnostic = {
  canStartDocker: boolean;
  code: DockerDiagnosticCode;
  detail: string;
  installUrl: string;
  platform: NodeJS.Platform;
  title: string;
};

export type DockerResource = "guide" | "install";

type DockerCommandFailure = {
  code?: unknown;
  message?: string;
  stderr?: string;
  stdout?: string;
};

const DOCKER_INFO_TIMEOUT_MS = 8_000;

export function getDockerInstallUrl(platform: NodeJS.Platform) {
  if (platform === "darwin") {
    return "https://docs.docker.com/desktop/setup/install/mac-install/";
  }
  if (platform === "win32") {
    return "https://docs.docker.com/desktop/setup/install/windows-install/";
  }
  return "https://docs.docker.com/engine/install/";
}

export function getDockerGuideUrl(
  code: DockerDiagnosticCode,
  platform: NodeJS.Platform,
) {
  if (code === "cli_missing") {
    return getDockerInstallUrl(platform);
  }
  if (code === "permission_denied") {
    return "https://docs.docker.com/engine/install/linux-postinstall/";
  }
  if (code === "virtualization_unavailable" && platform === "win32") {
    return "https://docs.docker.com/desktop/setup/install/windows-install/#system-requirements";
  }
  if (code === "disk_full") {
    return "https://docs.docker.com/desktop/use-desktop/disk-space/";
  }
  if (code === "context_invalid") {
    return "https://docs.docker.com/reference/cli/docker/context/";
  }
  if (code === "daemon_stopped") {
    return getDockerInstallUrl(platform);
  }
  return "https://docs.docker.com/desktop/troubleshoot-and-support/troubleshoot/";
}

export function getDockerResourceUrl(
  resource: DockerResource,
  code: DockerDiagnosticCode,
  platform: NodeJS.Platform = process.platform,
) {
  return resource === "install"
    ? getDockerInstallUrl(platform)
    : getDockerGuideUrl(code, platform);
}

export function isDockerDiagnosticCode(
  value: unknown,
): value is DockerDiagnosticCode {
  return [
    "ready",
    "cli_missing",
    "daemon_stopped",
    "permission_denied",
    "virtualization_unavailable",
    "disk_full",
    "context_invalid",
    "startup_timeout",
    "unknown",
  ].includes(String(value));
}

function getDiagnosticPresentation(code: DockerDiagnosticCode) {
  const presentations: Record<
    DockerDiagnosticCode,
    { canStartDocker: boolean; title: string }
  > = {
    ready: { canStartDocker: false, title: "Docker is ready" },
    cli_missing: { canStartDocker: false, title: "Docker is not installed" },
    daemon_stopped: {
      canStartDocker: true,
      title: "Docker is installed but not running",
    },
    permission_denied: {
      canStartDocker: false,
      title: "Docker permission denied",
    },
    virtualization_unavailable: {
      canStartDocker: false,
      title: "Docker virtualization is unavailable",
    },
    disk_full: { canStartDocker: false, title: "Docker storage is full" },
    context_invalid: {
      canStartDocker: false,
      title: "Docker context is unavailable",
    },
    startup_timeout: {
      canStartDocker: true,
      title: "Docker readiness check timed out",
    },
    unknown: { canStartDocker: false, title: "Docker check failed" },
  };
  return presentations[code];
}

function normalizeFailureText(failure: DockerCommandFailure) {
  return [failure.stderr, failure.stdout, failure.message]
    .filter(Boolean)
    .join("\n")
    .trim();
}

export function classifyDockerFailure(
  failure: DockerCommandFailure,
): DockerDiagnosticCode {
  const text = normalizeFailureText(failure).toLowerCase();
  const code = String(failure.code || "").toLowerCase();

  if (
    code === "enoent" ||
    text.includes("command not found") ||
    text.includes("is not recognized as an internal or external command")
  ) {
    return "cli_missing";
  }
  if (code === "etimedout" || text.includes("timed out")) {
    return "startup_timeout";
  }
  if (
    text.includes("permission denied") ||
    text.includes("got permission denied while trying to connect") ||
    text.includes("access is denied")
  ) {
    return "permission_denied";
  }
  if (
    text.includes("wsl 2") ||
    text.includes("virtualization") ||
    text.includes("hyper-v")
  ) {
    return "virtualization_unavailable";
  }
  if (
    text.includes("no space left on device") ||
    text.includes("insufficient disk space") ||
    text.includes("disk is full")
  ) {
    return "disk_full";
  }
  if (
    text.includes("docker context") ||
    text.includes("context deadline exceeded") ||
    text.includes("unable to resolve docker endpoint")
  ) {
    return "context_invalid";
  }
  if (
    text.includes("cannot connect to the docker daemon") ||
    text.includes("is the docker daemon running") ||
    text.includes("open //./pipe/docker") ||
    text.includes("the system cannot find the file specified")
  ) {
    return "daemon_stopped";
  }
  return "unknown";
}

export function createDockerDiagnostic(
  code: DockerDiagnosticCode,
  detail = "",
  platform: NodeJS.Platform = process.platform,
): DockerDiagnostic {
  return {
    ...getDiagnosticPresentation(code),
    code,
    detail,
    installUrl: getDockerInstallUrl(platform),
    platform,
  };
}

export function diagnoseDocker(
  env: NodeJS.ProcessEnv,
  timeoutMs = DOCKER_INFO_TIMEOUT_MS,
) {
  return new Promise<DockerDiagnostic>((resolve) => {
    execFile(
      "docker",
      ["info"],
      {
        env,
        timeout: timeoutMs,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        if (!error) {
          resolve(createDockerDiagnostic("ready", "docker info"));
          return;
        }

        const failure = error as ExecFileException;
        const detail = normalizeFailureText({
          code: failure.code,
          message: failure.message,
          stderr: String(stderr),
          stdout: String(stdout),
        });
        resolve(
          createDockerDiagnostic(classifyDockerFailure({
            code: failure.code,
            message: failure.message,
            stderr: String(stderr),
            stdout: String(stdout),
          }), detail),
        );
      },
    );
  });
}
