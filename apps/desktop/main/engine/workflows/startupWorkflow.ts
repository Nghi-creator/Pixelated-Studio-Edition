import crypto from "crypto";
import type { IpcMainEvent } from "electron";
import {
  buildPrepareEngineVolumeArgs,
  removeEngineContainerArgs,
} from "../../docker/commands";
import { withDockerStartCapability } from "../../docker/recovery";
import { emitEngineState, setCurrentEnginePhase } from "../../runtime/state";
import { startCompanionForEngine } from "../companionLifecycle";
import type { RuntimeSwitchHandler } from "../controllerTypes";
import type { EngineControllerState } from "../controllerState";
import { finishStartupAttempt } from "../controllerState";
import { emitDockerDiagnostic } from "../diagnosticEvents";
import { createImageRecoveryPayload } from "../imageRecovery";
import {
  getDockerRunArgs,
  type EngineLaunchContext,
  type StartEngineOptions,
} from "../launch";

const IMAGE_RECOVERY_HANDLED = Symbol("image-recovery-handled");

function getErrorMessage(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

export function rejectInvalidImage(event: IpcMainEvent) {
  setCurrentEnginePhase("image");
  emitEngineState(event, "FAILED", "Invalid image reference");
  event.reply(
    "server-log",
    '<span class="text-red-500">ERROR: Invalid PIXELATED_ENGINE_IMAGE value.</span>',
  );
  event.reply("engine-stopped");
}

function emitImageRecovery(
  state: EngineControllerState,
  event: IpcMainEvent,
  launchContext: EngineLaunchContext,
  err: unknown,
) {
  state.dependencies.stopCompanionServer();
  state.activeCompanion = null;
  const message = getErrorMessage(err);
  emitEngineState(event, "FAILED", message);
  event.reply(
    "engine-image-recovery",
    createImageRecoveryPayload(launchContext, message),
  );
  event.reply(
    "server-log",
    `<span class="text-red-500">ERROR: Engine image preparation failed: ${message}</span>`,
  );
  event.reply("engine-stopped");
}

function handleStartupFailure(
  state: EngineControllerState,
  event: IpcMainEvent,
  safeEnv: NodeJS.ProcessEnv,
  startErr: unknown,
) {
  state.dependencies.stopCompanionServer();
  state.activeCompanion = null;
  const message = getErrorMessage(startErr);
  emitEngineState(event, "FAILED", message);
  event.reply(
    "server-log",
    `<span class="text-red-500">ERROR: ${message}</span>`,
  );
  void state.dependencies
    .execFileCommand("docker", removeEngineContainerArgs, { env: safeEnv })
    .catch(() => undefined)
    .finally(() => {
      event.reply("engine-stopped");
    });
}

async function startContainer(
  state: EngineControllerState,
  event: IpcMainEvent,
  safeEnv: NodeJS.ProcessEnv,
  launchContext: EngineLaunchContext,
) {
  if (!state.engineToken) {
    throw new Error("Engine token has not been initialized.");
  }

  emitEngineState(
    event,
    "STARTING_CONTAINER",
    `${launchContext.publishHost}:8080`,
  );
  event.reply(
    "server-log",
    `Starting WebRTC Node in ${launchContext.exposureMode.toUpperCase()} mode...`,
  );
  await state.dependencies.execFileCommand(
    "docker",
    getDockerRunArgs({ ...launchContext, engineToken: state.engineToken }),
    { env: safeEnv },
  );
}

export async function continueEngineStartup({
  attempt,
  event,
  launchContext,
  onRuntimeSwitch,
  safeEnv,
  skipImagePreparation = false,
  state,
}: {
  attempt: number;
  event: IpcMainEvent;
  launchContext: EngineLaunchContext;
  onRuntimeSwitch: RuntimeSwitchHandler;
  safeEnv: NodeJS.ProcessEnv;
  skipImagePreparation?: boolean;
  state: EngineControllerState;
}) {
  if (attempt !== state.activeStartupAttempt) return;
  event.reply("server-log", "Docker Engine found.");

  try {
    if (!skipImagePreparation) {
      try {
        await state.dependencies.prepareEngineImage(
          event,
          safeEnv,
          launchContext.runtimeConfig,
        );
      } catch (imageErr) {
        finishStartupAttempt(state, attempt);
        emitImageRecovery(state, event, launchContext, imageErr);
        throw IMAGE_RECOVERY_HANDLED;
      }
    }

    event.reply("server-log", "Image ready. Preparing WebRTC Node...");
    emitEngineState(event, "REMOVING_STALE", "pixelated-node");
    await state.dependencies
      .execFileCommand("docker", removeEngineContainerArgs, { env: safeEnv })
      .catch(() => undefined);
    await state.dependencies.execFileCommand(
      "docker",
      buildPrepareEngineVolumeArgs(launchContext.runtimeConfig.engineImage),
      { env: safeEnv },
    );
    await startContainer(state, event, safeEnv, launchContext);

    emitEngineState(event, "WAITING_HEALTH", "30 attempts / 1s interval");
    event.reply("server-log", "Waiting for engine health check...");
    await state.dependencies.waitForEngineHealth();

    if (!state.engineToken) {
      throw new Error("Engine token has not been initialized.");
    }
    const companion = await startCompanionForEngine({
      dependencies: state.dependencies,
      engineToken: state.engineToken,
      event,
      launchContext,
      onRuntimeSwitch,
    });
    state.activeCompanion = companion;
    emitEngineState(event, "READY", "http://127.0.0.1:8080/health");
    event.reply("engine-token", state.engineToken);
    event.reply("engine-exposure", {
      advertisedUrls: launchContext.advertisedUrls,
      companionUrls: companion?.urls || [],
      exposureMode: launchContext.exposureMode,
    });
    event.reply(
      "server-log",
      '<span class="text-green-500">SUCCESS: PIXELATED Engine healthy on Port 8080.</span>',
    );
    finishStartupAttempt(state, attempt);
  } catch (startErr) {
    if (startErr === IMAGE_RECOVERY_HANDLED) return;
    finishStartupAttempt(state, attempt);
    handleStartupFailure(state, event, safeEnv, startErr);
  }
}

export async function buildEngineImageWorkflow({
  event,
  launchContext,
  options,
  startEngine,
  state,
}: {
  event: IpcMainEvent;
  launchContext: EngineLaunchContext;
  options: StartEngineOptions;
  startEngine: (event: IpcMainEvent, options?: StartEngineOptions) => void;
  state: EngineControllerState;
}) {
  const safeEnv = state.dependencies.getSafeEnv();
  const attempt = ++state.activeStartupAttempt;
  state.startupInProgress = true;
  emitEngineState(event, "CHECKING_DOCKER");
  event.reply("engine-image-build-started");
  event.reply(
    "server-log",
    "Checking Docker daemon before rebuilding engine image...",
  );

  if (options.preserveEngineToken !== true || !state.engineToken) {
    state.engineToken = crypto.randomBytes(24).toString("base64url");
  }
  state.dependencies.stopCompanionServer({
    preserveSecurityState: launchContext.preserveCompanionSecurity,
  });
  state.activeCompanion = null;

  try {
    const diagnostic = await state.dependencies.diagnoseDocker(safeEnv);
    if (attempt !== state.activeStartupAttempt) return;
    if (diagnostic.code !== "ready") {
      finishStartupAttempt(state, attempt);
      emitDockerDiagnostic(event, withDockerStartCapability(diagnostic));
      return;
    }

    event.reply(
      "server-log",
      "Building engine image from the local runtime Dockerfile...",
    );
    await state.dependencies.prepareEngineImage(
      event,
      safeEnv,
      launchContext.runtimeConfig,
    );
    if (attempt !== state.activeStartupAttempt) return;

    event.reply("engine-image-build-ready");
    event.reply("server-log", "Engine image built. Resuming startup.");
    finishStartupAttempt(state, attempt);
    startEngine(event, {
      ...options,
      preserveEngineToken: true,
      skipImagePreparation: true,
    });
  } catch (err) {
    if (attempt !== state.activeStartupAttempt) return;
    finishStartupAttempt(state, attempt);
    emitImageRecovery(state, event, launchContext, err);
  }
}
