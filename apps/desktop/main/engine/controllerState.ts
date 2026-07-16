import type {
  ActiveCompanion,
  EngineControllerDependencies,
} from "./controllerTypes";

export type EngineControllerState = {
  activeCompanion: ActiveCompanion | null;
  activeStartupAttempt: number;
  dependencies: EngineControllerDependencies;
  engineToken: string | null;
  recoveryInProgress: boolean;
  startupInProgress: boolean;
};

export function createEngineControllerState(
  dependencies: EngineControllerDependencies,
): EngineControllerState {
  return {
    activeCompanion: null,
    activeStartupAttempt: 0,
    dependencies,
    engineToken: null,
    recoveryInProgress: false,
    startupInProgress: false,
  };
}

export function resetEngineControllerState(
  state: EngineControllerState,
  dependencies: EngineControllerDependencies,
) {
  state.activeCompanion = null;
  state.activeStartupAttempt = 0;
  state.dependencies = dependencies;
  state.engineToken = null;
  state.recoveryInProgress = false;
  state.startupInProgress = false;
}

export function finishStartupAttempt(
  state: EngineControllerState,
  attempt: number,
) {
  if (state.activeStartupAttempt === attempt) {
    state.startupInProgress = false;
  }
}
