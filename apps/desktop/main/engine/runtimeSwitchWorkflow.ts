import type { IpcMainEvent } from "electron";
import type { EngineRuntimeKind } from "../runtime/config";
import { removeEngineContainerArgs } from "../docker/commands";
import { emitEngineState } from "../runtime/state";
import type {
  EngineClientPayload,
  EngineHealthPayload,
} from "./controllerTypes";
import type { EngineControllerState } from "./controllerState";
import type { StartEngineOptions } from "./launch";
import { getRuntimeSwitchBlocker } from "./runtimeSwitch";

const getErrorMessage = (err: unknown) =>
  err instanceof Error ? err.message : String(err);

export async function runRuntimeSwitch({
  event,
  getEngineHealth,
  listEngineClients,
  runtimeKind,
  startEngine,
  state,
  stopActiveEngineSession,
}: {
  event: IpcMainEvent;
  getEngineHealth: () => Promise<EngineHealthPayload>;
  listEngineClients: () => Promise<{ clients: EngineClientPayload[] }>;
  runtimeKind: EngineRuntimeKind;
  startEngine: (event: IpcMainEvent, options?: StartEngineOptions) => void;
  state: EngineControllerState;
  stopActiveEngineSession: () => Promise<unknown>;
}) {
  const exposureMode = state.activeCompanion?.exposureMode || "local";
  if (state.startupInProgress || state.recoveryInProgress) {
    event.reply(
      "server-log",
      "Runtime switch requested, but engine initialization is already in progress.",
    );
    return {
      code: "runtime_switch_busy",
      error: "Engine initialization is already in progress.",
      status: "blocked" as const,
    };
  }

  try {
    let health = await getEngineHealth();
    if (health.runtimeKind === runtimeKind) {
      return { runtimeKind, status: "unchanged" as const };
    }

    const activeSessionId = health.checks?.runtime?.activeSessionId;
    if (activeSessionId) {
      event.reply(
        "server-log",
        `Stopping active game session ${activeSessionId} before switching runtime...`,
      );
      await stopActiveEngineSession();
      health = await getEngineHealth();
    }

    const blocker = getRuntimeSwitchBlocker(
      (await listEngineClients()).clients,
      health.checks?.runtime?.activeSessionId,
    );
    if (blocker) {
      event.reply(
        "server-log",
        "Runtime switch blocked because a game session is active.",
      );
      return { ...blocker, status: "blocked" as const };
    }
  } catch (err) {
    return {
      code: "runtime_switch_client_check_failed",
      error: getErrorMessage(err),
      status: "blocked" as const,
    };
  }

  setTimeout(() => {
    state.activeStartupAttempt += 1;
    state.startupInProgress = false;
    state.recoveryInProgress = false;
    emitEngineState(event, "STOPPING", `Switching runtime to ${runtimeKind}`);
    event.reply(
      "server-log",
      `Switching engine runtime to ${runtimeKind}. Restarting container...`,
    );
    const safeEnv = state.dependencies.getSafeEnv();
    state.dependencies.stopCompanionServer({ preserveSecurityState: true });
    state.activeCompanion = null;

    void state.dependencies
      .execFileCommand("docker", removeEngineContainerArgs, { env: safeEnv })
      .catch(() => undefined)
      .finally(() => {
        startEngine(event, {
          exposureMode,
          preserveCompanionSecurity: true,
          preserveEngineToken: true,
          runtimeKind,
        });
      });
  }, 0);

  return { runtimeKind, status: "restarting" as const };
}
