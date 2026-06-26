import crypto from "crypto";
import { app, shell, type IpcMainEvent } from "electron";
import path from "path";
import {
  type EngineRuntimeKind,
  companionPort,
  hostedWebUrl,
} from "../runtime/config";
import {
  createCompanionLaunchTicket,
  revokeCompanionInvite,
  startCompanionServer,
  stopCompanionServer,
  updateCompanionInvite,
  type CompanionServerResult,
} from "../companion/server";
import {
  execFileCommand,
  getSafeEnv,
  isSafeDockerImageRef,
  prepareEngineImage,
} from "../docker/client";
import { removeEngineContainerArgs } from "../docker/commands";
import {
  createDockerDiagnostic,
  diagnoseDocker,
  type DockerDiagnostic,
} from "../docker/diagnostics";
import {
  discoverDockerStartPlan,
  executeDockerStartPlan,
  waitForDockerReady,
  withDockerStartCapability,
} from "../docker/recovery";
import { getLanIpv4Addresses } from "../network/exposure";
import { waitForEngineHealth } from "../runtime/health";
import { emitEngineState, setCurrentEnginePhase } from "../runtime/state";
import {
  createEngineLaunchContext,
  createHostedWebLaunchUrl,
  createHostedInviteUrl,
  createLanInvite,
  getDockerRunArgs,
  type EngineLaunchContext,
  type StartEngineOptions,
} from "./launch";

type ActiveCompanion = {
  advertisedUrls: string[];
  certPath: string;
  exposureMode: EngineLaunchContext["exposureMode"];
  launchUrl: string;
  urls: string[];
};

export type EngineClientPayload = {
  accessScope: "companion-guest" | "companion-host" | "raw";
  connectedAt: string;
  id: string;
  lastSeenAt: string;
  remoteAddress: string;
  role: string;
  sessionId: string | null;
  socketCount: number;
  userAgent: string;
};

let engineToken: string | null = null;
let activeCompanion: ActiveCompanion | null = null;
let activeStartupAttempt = 0;
let startupInProgress = false;
let recoveryInProgress = false;

function rejectInvalidImage(event: IpcMainEvent) {
  setCurrentEnginePhase("image");
  emitEngineState(event, "FAILED", "Invalid image reference");
  event.reply(
    "server-log",
    '<span class="text-red-500">ERROR: Invalid PIXELATED_ENGINE_IMAGE value.</span>',
  );
  event.reply("engine-stopped");
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
      onRuntimeSwitch: (runtimeKind) => {
        requestEngineRuntimeSwitch(event, runtimeKind);
      },
      port: companionPort,
      preserveSecurityState: launchContext.preserveCompanionSecurity,
    });
    const hostedInviteUrls = launchContext.companionUrls.map(createHostedInviteUrl);
    activeCompanion = {
      advertisedUrls: launchContext.advertisedUrls,
      certPath: companion.certPath,
      exposureMode: launchContext.exposureMode,
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
      `<span class="text-synth-secondary">Warning: Desktop HTTPS companion could not start: ${message}</span>`,
    );
  }
}

export function createWebLaunchUrl() {
  if (!activeCompanion || !engineToken) {
    throw new Error("Start the engine before launching the web app.");
  }

  return createHostedWebLaunchUrl({
    advertisedUrls: activeCompanion.advertisedUrls,
    companionLaunchUrl: activeCompanion.launchUrl,
    createLaunchTicket: createCompanionLaunchTicket,
    engineToken,
    exposureMode: activeCompanion.exposureMode,
  });
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

  const { inviteCode, inviteExpiresAt } = createLanInvite();
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

async function requestEngineControl<T>(
  pathName: string,
  options: { method?: "GET" | "POST" } = {},
) {
  if (!engineToken) {
    throw new Error("Engine token has not been initialized.");
  }

  const response = await fetch(`http://127.0.0.1:8080${pathName}`, {
    headers: {
      "X-Engine-Token": engineToken,
    },
    method: options.method || "GET",
  });
  if (!response.ok) {
    throw new Error(`Engine control request failed with ${response.status}.`);
  }

  return (await response.json()) as T;
}

export async function listEngineClients() {
  if (!engineToken) return { clients: [] as EngineClientPayload[] };

  return requestEngineControl<{ clients: EngineClientPayload[] }>("/clients");
}

export async function revokeEngineClient(clientId: string) {
  return requestEngineControl<{ disconnected: number }>(
    `/clients/${encodeURIComponent(clientId)}/revoke`,
    { method: "POST" },
  );
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

  return execFileCommand(
    "docker",
    getDockerRunArgs({
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
  void execFileCommand("docker", removeEngineContainerArgs, { env: safeEnv })
    .catch(() => undefined)
    .finally(() => {
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

  prepareEngineImage(event, safeEnv, launchContext.runtimeConfig)
    .then(() => {
      event.reply("server-log", "Image ready. Preparing WebRTC Node...");
      emitEngineState(event, "REMOVING_STALE", "pixelated-node");

      return execFileCommand("docker", removeEngineContainerArgs, { env: safeEnv }).catch(
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

function requestEngineRuntimeSwitch(
  event: IpcMainEvent,
  runtimeKind: EngineRuntimeKind,
) {
  const exposureMode = activeCompanion?.exposureMode || "local";
  if (startupInProgress || recoveryInProgress) {
    event.reply(
      "server-log",
      "Runtime switch requested, but engine initialization is already in progress.",
    );
    return;
  }

  activeStartupAttempt += 1;
  startupInProgress = false;
  recoveryInProgress = false;
  emitEngineState(event, "STOPPING", `Switching runtime to ${runtimeKind}`);
  event.reply(
    "server-log",
    `Switching engine runtime to ${runtimeKind}. Restarting container...`,
  );
  const safeEnv = getSafeEnv();
  stopCompanionServer({ preserveSecurityState: true });
  activeCompanion = null;

  void execFileCommand("docker", removeEngineContainerArgs, { env: safeEnv })
    .catch(() => undefined)
    .finally(() => {
      startEngine(event, {
        exposureMode,
        preserveCompanionSecurity: true,
        runtimeKind,
      });
    });
}

export function startEngine(event: IpcMainEvent, options: StartEngineOptions = {}) {
  if (startupInProgress || recoveryInProgress) {
    event.reply("server-log", "Engine initialization is already in progress.");
    return;
  }
  const launchContext = createEngineLaunchContext(options);
  if (!isSafeDockerImageRef(launchContext.runtimeConfig.engineImage)) {
    rejectInvalidImage(event);
    return;
  }

  emitEngineState(event, "CHECKING_DOCKER");
  event.reply("server-log", "Checking Docker daemon...");
  const safeEnv = getSafeEnv();
  const attempt = ++activeStartupAttempt;
  startupInProgress = true;

  engineToken = crypto.randomBytes(24).toString("base64url");
  stopCompanionServer({
    preserveSecurityState: launchContext.preserveCompanionSecurity,
  });
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

  void execFileCommand("docker", removeEngineContainerArgs, { env: safeEnv })
    .then(() => {
      event.reply("server-log", "Engine successfully terminated.");
    })
    .catch(() => {
      event.reply(
        "server-log",
        '<span class="text-red-500">Warning: Could not gracefully stop node.</span>',
      );
    })
    .finally(() => {
      emitEngineState(event, "STOPPED");
      event.reply("engine-stopped");
    });
}

export function rotateEngineToken(
  event: IpcMainEvent,
  options: StartEngineOptions = {},
) {
  if (!engineToken) {
    event.reply("server-log", "Start the engine before rotating the token.");
    return;
  }

  activeStartupAttempt += 1;
  startupInProgress = false;
  recoveryInProgress = false;
  emitEngineState(event, "STOPPING", "Rotating pairing token");
  event.reply("server-log", "Rotating host-local pairing token...");
  const safeEnv = getSafeEnv();
  stopCompanionServer();
  activeCompanion = null;

  void execFileCommand("docker", removeEngineContainerArgs, { env: safeEnv })
    .catch(() => undefined)
    .finally(() => {
      event.reply("server-log", "Restarting engine with a fresh pairing token.");
      startEngine(event, options);
    });
}

export function cleanupEngine() {
  activeStartupAttempt += 1;
  startupInProgress = false;
  recoveryInProgress = false;
  const safeEnv = getSafeEnv();
  stopCompanionServer();
  activeCompanion = null;
  void execFileCommand("docker", removeEngineContainerArgs, { env: safeEnv }).catch(
    () => undefined,
  );
}
