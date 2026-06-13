import crypto from "crypto";
import { app, shell, type IpcMainEvent } from "electron";
import path from "path";
import {
  backendApiUrl,
  companionPort,
  engineAllowedOrigins,
  engineImage,
  hostedWebUrl,
} from "./config";
import {
  createCompanionLaunchTicket,
  revokeCompanionInvite,
  startCompanionServer,
  stopCompanionServer,
  updateCompanionInvite,
  type CompanionServerResult,
} from "./companionServer";
import {
  exec,
  execCommand,
  getSafeEnv,
  hasHostUinput,
  isSafeDockerImageRef,
  prepareEngineImage,
  quoteDockerEnvValue,
} from "./docker";
import {
  createDockerDiagnostic,
  diagnoseDocker,
  type DockerDiagnostic,
} from "./dockerDiagnostics";
import {
  discoverDockerStartPlan,
  executeDockerStartPlan,
  waitForDockerReady,
  withDockerStartCapability,
} from "./dockerRecovery";
import {
  getAdvertisedEngineUrls,
  getAdvertisedCompanionUrls,
  getDockerPublishHost,
  getLanIpv4Addresses,
  normalizeExposureMode,
  type ExposureMode,
} from "./exposure";
import { waitForEngineHealth } from "./health";
import { emitEngineState, setCurrentEnginePhase } from "./state";

type StartEngineOptions = {
  exposureMode?: unknown;
};

type EngineLaunchContext = {
  advertisedUrls: string[];
  companionUrls: string[];
  deviceArgs: string;
  exposureMode: ExposureMode;
  inviteCode?: string;
  inviteExpiresAt?: number;
  publishHost: string;
};

type DockerRunOptions = EngineLaunchContext & {
  engineToken: string;
};

type ActiveCompanion = {
  certPath: string;
  launchUrl: string;
  urls: string[];
};

let engineToken: string | null = null;
let activeCompanion: ActiveCompanion | null = null;
let activeStartupAttempt = 0;
let startupInProgress = false;
let recoveryInProgress = false;

const INVITE_CODE_TTL_MS = 10 * 60 * 1000;

function createInviteCode() {
  return crypto.randomBytes(4).toString("hex").toUpperCase();
}

function createHostedInviteUrl(companionUrl: string) {
  const url = new URL("/engine", hostedWebUrl);
  url.searchParams.set("companionUrl", companionUrl);
  url.searchParams.set("join", "invite");
  return url.toString();
}

function buildDockerRunCommand({
  advertisedUrls,
  companionUrls,
  deviceArgs = "",
  engineToken,
  exposureMode,
  publishHost,
}: DockerRunOptions) {
  const allowedOrigins = [
    engineAllowedOrigins,
    `https://localhost:${companionPort}`,
    ...companionUrls,
  ]
    .filter(Boolean)
    .join(",");

  return `docker run -d --name pixelated-node -p ${publishHost}:8080:8080 ${deviceArgs} -v pixelated-roms:/roms -e PIXELATED_ALLOWED_ORIGINS="${quoteDockerEnvValue(allowedOrigins)}" -e PIXELATED_ALLOWED_ROM_HOSTS="pxksbsloksyfwiqyfkrz.supabase.co" -e PIXELATED_API_URL="${quoteDockerEnvValue(backendApiUrl)}" -e PIXELATED_ENGINE_TOKEN="${quoteDockerEnvValue(engineToken)}" -e PIXELATED_ENGINE_EXPOSURE_MODE="${exposureMode}" -e PIXELATED_ADVERTISED_URLS="${quoteDockerEnvValue(advertisedUrls.join(","))}" -e PIXELATED_COMPANION_URLS="${quoteDockerEnvValue(companionUrls.join(","))}" ${engineImage}`;
}

function rejectInvalidImage(event: IpcMainEvent) {
  setCurrentEnginePhase("image");
  emitEngineState(event, "FAILED", "Invalid image reference");
  event.reply(
    "server-log",
    '<span class="text-red-500">ERROR: Invalid PIXELATED_ENGINE_IMAGE value.</span>',
  );
  event.reply("engine-stopped");
}

function createEngineLaunchContext(options: StartEngineOptions = {}): EngineLaunchContext {
  const exposureMode = normalizeExposureMode(options.exposureMode);
  const publishHost = getDockerPublishHost(exposureMode);
  const advertisedUrls = getAdvertisedEngineUrls(exposureMode);
  const companionUrls = getAdvertisedCompanionUrls(exposureMode, companionPort);
  const deviceArgs = hasHostUinput() ? "--device /dev/uinput" : "";
  const inviteCode = exposureMode === "lan" ? createInviteCode() : undefined;
  const inviteExpiresAt =
    exposureMode === "lan" ? Date.now() + INVITE_CODE_TTL_MS : undefined;

  return {
    advertisedUrls,
    companionUrls,
    deviceArgs,
    exposureMode,
    inviteCode,
    inviteExpiresAt,
    publishHost,
  };
}

async function startCompanion(
  event: IpcMainEvent,
  launchContext: EngineLaunchContext,
) {
  if (!engineToken) {
    throw new Error("Engine token has not been initialized.");
  }

  try {
    const companion: CompanionServerResult = await startCompanionServer({
      certDir: path.join(app.getPath("userData"), "certificates"),
      engineToken,
      inviteCode: launchContext.inviteCode,
      inviteExpiresAt: launchContext.inviteExpiresAt,
      lanAddresses: getLanIpv4Addresses(),
      launchAllowedOrigins: [
        new URL(hostedWebUrl).origin,
        "http://localhost:5173",
        "http://127.0.0.1:5173",
      ],
      port: companionPort,
    });
    const hostedInviteUrls = launchContext.companionUrls.map(createHostedInviteUrl);
    activeCompanion = {
      certPath: companion.certPath,
      launchUrl: `https://localhost:${companion.port}`,
      urls: hostedInviteUrls,
    };
    if (launchContext.exposureMode === "lan" && launchContext.inviteExpiresAt) {
      event.reply("engine-companion", {
        certPath: companion.certPath,
        enabled: true,
        inviteCode: launchContext.inviteCode,
        inviteExpiresAt: new Date(launchContext.inviteExpiresAt).toISOString(),
        inviteRevoked: false,
        inviteStatus: "Invite code active.",
        urls: hostedInviteUrls,
      });
    } else {
      event.reply("engine-companion", {
        enabled: false,
        urls: [],
      });
    }
    event.reply(
      "server-log",
      `Desktop companion HTTPS server ready on port ${companion.port}.`,
    );
  } catch (err) {
    const message = getErrorMessage(err);
    activeCompanion = null;
    event.reply("engine-companion", {
      enabled: false,
      error: message,
      urls: [],
    });
    event.reply(
      "server-log",
      `<span class="text-amber-300">Warning: Desktop HTTPS companion could not start: ${message}</span>`,
    );
  }
}

export function createWebLaunchUrl() {
  if (!activeCompanion) {
    throw new Error("Start the engine before launching the web app.");
  }

  const url = new URL(hostedWebUrl);
  url.searchParams.set("companionUrl", activeCompanion.launchUrl);
  url.searchParams.set("launchTicket", createCompanionLaunchTicket());
  return url.toString();
}

export function regenerateLanInvite(event: IpcMainEvent) {
  if (!engineToken || !activeCompanion) {
    event.reply("engine-companion", {
      enabled: false,
      error: "Start the engine in LAN mode before changing invite codes.",
      urls: [],
    });
    return;
  }

  const inviteCode = createInviteCode();
  const inviteExpiresAt = Date.now() + INVITE_CODE_TTL_MS;
  updateCompanionInvite(inviteCode, inviteExpiresAt);
  emitCompanionInvite(event, {
    inviteCode,
    inviteExpiresAt,
    inviteRevoked: false,
    inviteStatus: "Invite code regenerated. Previous codes no longer work.",
  });
  event.reply("server-log", "LAN invite code regenerated.");
}

export function revokeLanInvite(event: IpcMainEvent) {
  if (!activeCompanion) {
    event.reply("engine-companion", {
      enabled: false,
      error: "Start the engine in LAN mode before revoking invite codes.",
      urls: [],
    });
    return;
  }

  revokeCompanionInvite();
  emitCompanionInvite(event, {
    inviteRevoked: true,
    inviteStatus:
      "Invite code revoked. Regenerate a code before inviting more guests.",
  });
  event.reply("server-log", "LAN invite code revoked.");
}

function getErrorMessage(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

function emitCompanionInvite(
  event: IpcMainEvent,
  payload: {
    inviteCode?: string;
    inviteExpiresAt?: number;
    inviteRevoked?: boolean;
    inviteStatus: string;
  },
) {
  if (!activeCompanion) {
    event.reply("engine-companion", {
      enabled: false,
      error: "LAN companion is not running.",
      urls: [],
    });
    return;
  }

  event.reply("engine-companion", {
    certPath: activeCompanion.certPath,
    enabled: true,
    inviteCode: payload.inviteCode,
    inviteExpiresAt: payload.inviteExpiresAt
      ? new Date(payload.inviteExpiresAt).toISOString()
      : undefined,
    inviteRevoked: payload.inviteRevoked,
    inviteStatus: payload.inviteStatus,
    urls: activeCompanion.urls,
  });
}

function startContainer(
  event: IpcMainEvent,
  safeEnv: NodeJS.ProcessEnv,
  launchContext: EngineLaunchContext,
) {
  if (!engineToken) {
    throw new Error("Engine token has not been initialized.");
  }

  emitEngineState(event, "STARTING_CONTAINER", `${launchContext.publishHost}:8080`);
  event.reply(
    "server-log",
    `Starting WebRTC Node in ${launchContext.exposureMode.toUpperCase()} mode...`,
  );

  return execCommand(
    buildDockerRunCommand({
      ...launchContext,
      engineToken,
    }),
    { env: safeEnv },
  );
}

function handleStartupFailure(
  event: IpcMainEvent,
  safeEnv: NodeJS.ProcessEnv,
  startErr: unknown,
) {
  stopCompanionServer();
  activeCompanion = null;
  const message = getErrorMessage(startErr);
  emitEngineState(event, "FAILED", message);
  event.reply(
    "server-log",
    `<span class="text-red-500">ERROR: ${message}</span>`,
  );
  exec("docker rm -f pixelated-node", { env: safeEnv }, () => {
    event.reply("engine-stopped");
  });
}

function emitDockerDiagnostic(event: IpcMainEvent, diagnostic: DockerDiagnostic) {
  emitEngineState(event, "FAILED", diagnostic.title);
  event.reply("docker-diagnostic", diagnostic);
  event.reply(
    "server-log",
    `<span class="text-red-500">ERROR: ${diagnostic.title}.</span>`,
  );
  if (diagnostic.detail) {
    event.reply("server-log", `Docker diagnostic: ${diagnostic.detail}`);
  }
  event.reply("engine-stopped");
}

function finishStartupAttempt(attempt: number) {
  if (activeStartupAttempt === attempt) startupInProgress = false;
}

function continueEngineStartup(
  event: IpcMainEvent,
  safeEnv: NodeJS.ProcessEnv,
  launchContext: EngineLaunchContext,
  attempt: number,
) {
  if (attempt !== activeStartupAttempt) return;
  event.reply("server-log", "Docker Engine found.");

  prepareEngineImage(event, safeEnv)
    .then(() => {
      event.reply("server-log", "Image ready. Preparing WebRTC Node...");
      emitEngineState(event, "REMOVING_STALE", "pixelated-node");

      return execCommand("docker rm -f pixelated-node", { env: safeEnv }).catch(
        () => undefined,
      );
    })
    .then(() => startContainer(event, safeEnv, launchContext))
    .then(() => {
      emitEngineState(event, "WAITING_HEALTH", "30 attempts / 1s interval");
      event.reply("server-log", "Waiting for engine health check...");
      return waitForEngineHealth();
    })
    .then(() => {
      return startCompanion(event, launchContext).then(() => {
        emitEngineState(event, "READY", "http://127.0.0.1:8080/health");
        event.reply("engine-token", engineToken);
        event.reply("engine-exposure", {
          advertisedUrls: launchContext.advertisedUrls,
          companionUrls: activeCompanion ? activeCompanion.urls : [],
          exposureMode: launchContext.exposureMode,
        });
        event.reply(
          "server-log",
          '<span class="text-green-500">SUCCESS: PIXELATED Engine healthy on Port 8080.</span>',
        );
        finishStartupAttempt(attempt);
      });
    })
    .catch((startErr) => {
      finishStartupAttempt(attempt);
      handleStartupFailure(event, safeEnv, startErr);
    });
}

export function startEngine(event: IpcMainEvent, options: StartEngineOptions = {}) {
  if (startupInProgress || recoveryInProgress) {
    event.reply("server-log", "Engine initialization is already in progress.");
    return;
  }
  if (!isSafeDockerImageRef(engineImage)) {
    rejectInvalidImage(event);
    return;
  }

  emitEngineState(event, "CHECKING_DOCKER");
  event.reply("server-log", "Checking Docker daemon...");
  const safeEnv = getSafeEnv();
  const launchContext = createEngineLaunchContext(options);
  const attempt = ++activeStartupAttempt;
  startupInProgress = true;

  engineToken = crypto.randomBytes(24).toString("base64url");
  stopCompanionServer();
  activeCompanion = null;

  void diagnoseDocker(safeEnv).then((diagnostic) => {
    if (attempt !== activeStartupAttempt) return;
    if (diagnostic.code !== "ready") {
      finishStartupAttempt(attempt);
      emitDockerDiagnostic(event, withDockerStartCapability(diagnostic));
      return;
    }
    continueEngineStartup(event, safeEnv, launchContext, attempt);
  });
}

export function startDockerAndResume(
  event: IpcMainEvent,
  options: StartEngineOptions = {},
) {
  if (startupInProgress || recoveryInProgress) {
    event.reply("server-log", "Docker startup is already in progress.");
    return;
  }

  const startPlan = discoverDockerStartPlan();
  if (!startPlan) {
    const diagnostic = createDockerDiagnostic(
      "daemon_stopped",
      "No trusted Docker Desktop application or supported user service was found.",
    );
    emitDockerDiagnostic(
      event,
      { ...diagnostic, canStartDocker: false },
    );
    return;
  }

  const attempt = ++activeStartupAttempt;
  recoveryInProgress = true;
  emitEngineState(event, "CHECKING_DOCKER", "Starting Docker Desktop");
  event.reply("docker-recovery-started");
  event.reply("server-log", "Starting Docker from a trusted system location...");

  void executeDockerStartPlan(startPlan, (targetPath) => shell.openPath(targetPath))
    .then(() => {
      event.reply("server-log", "Waiting for Docker Desktop to become ready...");
      return waitForDockerReady(getSafeEnv(), {
        isCancelled: () => attempt !== activeStartupAttempt,
      });
    })
    .then((diagnostic) => {
      if (attempt !== activeStartupAttempt) return;
      recoveryInProgress = false;
      if (diagnostic.code !== "ready") {
        emitDockerDiagnostic(event, diagnostic);
        return;
      }

      event.reply("server-log", "Docker is ready. Resuming engine initialization.");
      event.reply("docker-recovery-ready");
      startEngine(event, options);
    })
    .catch((err) => {
      if (attempt !== activeStartupAttempt) return;
      recoveryInProgress = false;
      emitDockerDiagnostic(
        event,
        createDockerDiagnostic("unknown", getErrorMessage(err)),
      );
    });
}

export function cancelDockerRecovery(event: IpcMainEvent) {
  if (!recoveryInProgress) return;

  activeStartupAttempt += 1;
  recoveryInProgress = false;
  emitEngineState(event, "STOPPED");
  event.reply("server-log", "Cancelled waiting for Docker Desktop.");
  event.reply("docker-recovery-cancelled");
  event.reply("engine-stopped");
}

export function stopEngine(event: IpcMainEvent) {
  activeStartupAttempt += 1;
  startupInProgress = false;
  recoveryInProgress = false;
  emitEngineState(event, "STOPPING");
  event.reply("server-log", "Initiating shutdown sequence...");
  const safeEnv = getSafeEnv();
  stopCompanionServer();
  activeCompanion = null;

  exec("docker rm -f pixelated-node", { env: safeEnv }, (err) => {
    if (err) {
      event.reply(
        "server-log",
        '<span class="text-red-500">Warning: Could not gracefully stop node.</span>',
      );
    } else {
      event.reply("server-log", "Engine successfully terminated.");
    }
    emitEngineState(event, "STOPPED");
    event.reply("engine-stopped");
  });
}

export function cleanupEngine() {
  activeStartupAttempt += 1;
  startupInProgress = false;
  recoveryInProgress = false;
  const safeEnv = getSafeEnv();
  stopCompanionServer();
  activeCompanion = null;
  exec("docker rm -f pixelated-node", { env: safeEnv });
}
