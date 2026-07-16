import { shell, type IpcMainEvent } from "electron";
import { createDockerDiagnostic } from "../../docker/diagnostics";
import {
  discoverDockerStartPlan,
  executeDockerStartPlan,
  waitForDockerReady,
} from "../../docker/recovery";
import { emitEngineState } from "../../runtime/state";
import type { EngineControllerState } from "../controllerState";
import type { StartEngineOptions } from "../launch";
import { emitDockerDiagnostic } from "./startupWorkflow";

const getErrorMessage = (err: unknown) =>
  err instanceof Error ? err.message : String(err);

export async function runDockerRecovery({
  event,
  options,
  startEngine,
  state,
}: {
  event: IpcMainEvent;
  options: StartEngineOptions;
  startEngine: (event: IpcMainEvent, options?: StartEngineOptions) => void;
  state: EngineControllerState;
}) {
  const startPlan = discoverDockerStartPlan();
  if (!startPlan) {
    const diagnostic = createDockerDiagnostic(
      "daemon_stopped",
      "No trusted Docker Desktop application or supported user service was found.",
    );
    emitDockerDiagnostic(event, { ...diagnostic, canStartDocker: false });
    return;
  }

  const attempt = ++state.activeStartupAttempt;
  state.recoveryInProgress = true;
  emitEngineState(event, "CHECKING_DOCKER", "Starting Docker Desktop");
  event.reply("docker-recovery-started");
  event.reply("server-log", "Starting Docker from a trusted system location...");

  try {
    await executeDockerStartPlan(startPlan, (targetPath) =>
      shell.openPath(targetPath),
    );
    event.reply("server-log", "Waiting for Docker Desktop to become ready...");
    const diagnostic = await waitForDockerReady(state.dependencies.getSafeEnv(), {
      isCancelled: () => attempt !== state.activeStartupAttempt,
    });
    if (attempt !== state.activeStartupAttempt) return;

    state.recoveryInProgress = false;
    if (diagnostic.code !== "ready") {
      emitDockerDiagnostic(event, diagnostic);
      return;
    }

    event.reply(
      "server-log",
      "Docker is ready. Resuming engine initialization.",
    );
    event.reply("docker-recovery-ready");
    startEngine(event, options);
  } catch (err) {
    if (attempt !== state.activeStartupAttempt) return;
    state.recoveryInProgress = false;
    emitDockerDiagnostic(
      event,
      createDockerDiagnostic("unknown", getErrorMessage(err)),
    );
  }
}

export function cancelDockerRecoveryWorkflow(
  state: EngineControllerState,
  event: IpcMainEvent,
) {
  if (!state.recoveryInProgress) return;

  state.activeStartupAttempt += 1;
  state.recoveryInProgress = false;
  emitEngineState(event, "STOPPED");
  event.reply("server-log", "Cancelled waiting for Docker Desktop.");
  event.reply("docker-recovery-cancelled");
  event.reply("engine-stopped");
}
