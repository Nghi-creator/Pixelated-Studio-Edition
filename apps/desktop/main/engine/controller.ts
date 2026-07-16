import crypto from "crypto";
import { app, type IpcMainEvent } from "electron";
import type { EngineRuntimeKind } from "../runtime/config";
import {
  revokeCompanionInvite,
  startCompanionServer,
  stopCompanionServer,
  updateCompanionInvite,
} from "../companion/server";
import {
  execFileCommand,
  getSafeEnv,
  isSafeDockerImageRef,
  prepareEngineImage,
} from "../docker/client";
import { removeEngineContainerArgs } from "../docker/commands";
import { diagnoseDocker } from "../docker/diagnostics";
import { withDockerStartCapability } from "../docker/recovery";
import { waitForEngineHealth } from "../runtime/health";
import { emitEngineState } from "../runtime/state";
import {
  createCompanionWebLaunchUrl,
  emitCompanionInvite,
} from "./companionLifecycle";
import {
  getEngineHealth as getEngineHealthControl,
  listEngineClients as listEngineClientsControl,
  revokeEngineClient as revokeEngineClientControl,
  stopActiveEngineSession as stopActiveEngineSessionControl,
} from "./controlClient";
import type {
  EngineClientPayload,
  EngineControllerDependencies,
} from "./controllerTypes";
import {
  createEngineControllerState,
  resetEngineControllerState,
} from "./controllerState";
import { createImageRecoveryPayload } from "./imageRecovery";
import {
  createEngineLaunchContext,
  createLanInvite,
  type StartEngineOptions,
} from "./launch";
import {
  cancelDockerRecoveryWorkflow,
  runDockerRecovery,
} from "./recoveryWorkflow";
import { runRuntimeSwitch } from "./runtimeSwitchWorkflow";
import {
  buildEngineImageWorkflow,
  continueEngineStartup,
  emitDockerDiagnostic,
  rejectInvalidImage,
} from "./startupWorkflow";

export type { EngineClientPayload } from "./controllerTypes";
export { createImageRecoveryPayload } from "./imageRecovery";

const defaultDependencies: EngineControllerDependencies = {
  diagnoseDocker,
  execFileCommand,
  getSafeEnv,
  getUserDataPath: () => app.getPath("userData"),
  prepareEngineImage,
  startCompanionServer,
  stopCompanionServer,
  waitForEngineHealth,
};
const state = createEngineControllerState(defaultDependencies);

export function resetEngineControllerForTest(
  overrides: Partial<EngineControllerDependencies> = {},
) {
  resetEngineControllerState(state, {
    ...defaultDependencies,
    ...overrides,
  });
}

export function createWebLaunchUrl() {
  if (!state.activeCompanion || !state.engineToken) {
    throw new Error("Start the engine before launching the web app.");
  }
  return createCompanionWebLaunchUrl(state.activeCompanion);
}

export function regenerateLanInvite(event: IpcMainEvent) {
  if (!state.engineToken || !state.activeCompanion) {
    event.reply("engine-companion", {
      enabled: false,
      error: "Start the engine in LAN mode before changing invite codes.",
      urls: [],
    });
    return;
  }

  const { inviteCode, inviteExpiresAt } = createLanInvite();
  updateCompanionInvite(inviteCode, inviteExpiresAt);
  emitCompanionInvite(event, state.activeCompanion, {
    inviteCode,
    inviteExpiresAt,
    inviteRevoked: false,
    inviteStatus: "Invite code regenerated. Previous codes no longer work.",
  });
  event.reply("server-log", "LAN invite code regenerated.");
}

export function revokeLanInvite(event: IpcMainEvent) {
  if (!state.activeCompanion) {
    event.reply("engine-companion", {
      enabled: false,
      error: "Start the engine in LAN mode before revoking invite codes.",
      urls: [],
    });
    return;
  }

  revokeCompanionInvite();
  emitCompanionInvite(event, state.activeCompanion, {
    inviteRevoked: true,
    inviteStatus:
      "Invite code revoked. Regenerate a code before inviting more guests.",
  });
  event.reply("server-log", "LAN invite code revoked.");
}

const getEngineToken = () => state.engineToken;

export async function listEngineClients() {
  return listEngineClientsControl(getEngineToken);
}

async function getEngineHealth() {
  return getEngineHealthControl(getEngineToken);
}

async function stopActiveEngineSession() {
  return stopActiveEngineSessionControl(getEngineToken);
}

export async function revokeEngineClient(clientId: string) {
  return revokeEngineClientControl(getEngineToken, clientId);
}

async function requestEngineRuntimeSwitch(
  event: IpcMainEvent,
  runtimeKind: EngineRuntimeKind,
) {
  return runRuntimeSwitch({
    event,
    getEngineHealth,
    listEngineClients,
    runtimeKind,
    startEngine,
    state,
    stopActiveEngineSession,
  });
}

export function startEngine(
  event: IpcMainEvent,
  options: StartEngineOptions = {},
) {
  if (state.startupInProgress || state.recoveryInProgress) {
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
  const safeEnv = state.dependencies.getSafeEnv();
  const attempt = ++state.activeStartupAttempt;
  state.startupInProgress = true;

  if (options.preserveEngineToken !== true || !state.engineToken) {
    state.engineToken = crypto.randomBytes(24).toString("base64url");
  }
  state.dependencies.stopCompanionServer({
    preserveSecurityState: launchContext.preserveCompanionSecurity,
  });
  state.activeCompanion = null;

  void state.dependencies.diagnoseDocker(safeEnv).then((diagnostic) => {
    if (attempt !== state.activeStartupAttempt) return;
    if (diagnostic.code !== "ready") {
      state.startupInProgress = false;
      emitDockerDiagnostic(event, withDockerStartCapability(diagnostic));
      return;
    }
    void continueEngineStartup({
      attempt,
      event,
      launchContext,
      onRuntimeSwitch: requestEngineRuntimeSwitch,
      safeEnv,
      skipImagePreparation: options.skipImagePreparation === true,
      state,
    });
  });
}

export function buildEngineImageAndResume(
  event: IpcMainEvent,
  options: StartEngineOptions = {},
) {
  if (state.startupInProgress || state.recoveryInProgress) {
    event.reply("server-log", "Engine initialization is already in progress.");
    return;
  }

  const launchContext = createEngineLaunchContext(options);
  if (!isSafeDockerImageRef(launchContext.runtimeConfig.engineImage)) {
    rejectInvalidImage(event);
    return;
  }

  void buildEngineImageWorkflow({
    event,
    launchContext,
    options,
    startEngine,
    state,
  });
}

export function startDockerAndResume(
  event: IpcMainEvent,
  options: StartEngineOptions = {},
) {
  if (state.startupInProgress || state.recoveryInProgress) {
    event.reply("server-log", "Docker startup is already in progress.");
    return;
  }
  void runDockerRecovery({ event, options, startEngine, state });
}

export function cancelDockerRecovery(event: IpcMainEvent) {
  cancelDockerRecoveryWorkflow(state, event);
}

export function stopEngine(event: IpcMainEvent) {
  state.activeStartupAttempt += 1;
  state.startupInProgress = false;
  state.recoveryInProgress = false;
  emitEngineState(event, "STOPPING");
  event.reply("server-log", "Initiating shutdown sequence...");
  const safeEnv = state.dependencies.getSafeEnv();
  state.dependencies.stopCompanionServer();
  state.activeCompanion = null;

  void state.dependencies
    .execFileCommand("docker", removeEngineContainerArgs, { env: safeEnv })
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
  if (!state.engineToken) {
    event.reply("server-log", "Start the engine before rotating the token.");
    return;
  }

  state.activeStartupAttempt += 1;
  state.startupInProgress = false;
  state.recoveryInProgress = false;
  emitEngineState(event, "STOPPING", "Rotating pairing token");
  event.reply("server-log", "Rotating host-local pairing token...");
  const safeEnv = state.dependencies.getSafeEnv();
  state.dependencies.stopCompanionServer();
  state.activeCompanion = null;

  void state.dependencies
    .execFileCommand("docker", removeEngineContainerArgs, { env: safeEnv })
    .catch(() => undefined)
    .finally(() => {
      event.reply("server-log", "Restarting engine with a fresh pairing token.");
      startEngine(event, options);
    });
}

export function cleanupEngine() {
  state.activeStartupAttempt += 1;
  state.startupInProgress = false;
  state.recoveryInProgress = false;
  const safeEnv = state.dependencies.getSafeEnv();
  state.dependencies.stopCompanionServer();
  state.activeCompanion = null;
  void state.dependencies
    .execFileCommand("docker", removeEngineContainerArgs, { env: safeEnv })
    .catch(() => undefined);
}
