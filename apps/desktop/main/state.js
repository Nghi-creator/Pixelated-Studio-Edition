let currentEnginePhase = "idle";

const engineStates = {
  CHECKING_DOCKER: {
    detail: "docker info",
    label: "Checking Docker",
    phase: "docker",
    status: "starting",
  },
  PULLING_IMAGE: {
    detail: "remote image",
    label: "Pulling Image",
    phase: "image",
    status: "starting",
  },
  BUILDING_IMAGE: {
    detail: "local Dockerfile",
    label: "Building Image",
    phase: "image",
    status: "starting",
  },
  REMOVING_STALE: {
    detail: "pixelated-node",
    label: "Removing Stale Container",
    phase: "cleanup",
    status: "starting",
  },
  STARTING_CONTAINER: {
    detail: "docker run",
    label: "Starting Container",
    phase: "container",
    status: "starting",
  },
  WAITING_HEALTH: {
    detail: "http://127.0.0.1:8080/health",
    label: "Waiting For Health",
    phase: "health",
    status: "starting",
  },
  READY: {
    detail: "Port 8080",
    label: "Engine Ready",
    phase: "ready",
    status: "ready",
  },
  STOPPING: {
    label: "Stopping Engine",
    phase: "stopping",
    status: "stopping",
  },
  STOPPED: {
    label: "Engine Offline",
    phase: "idle",
    status: "stopped",
  },
  FAILED: {
    label: "Engine Failed",
    status: "failed",
  },
};

function setCurrentEnginePhase(phase) {
  currentEnginePhase = phase;
}

function emitEngineState(event, key, detail = "") {
  const state = engineStates[key] || engineStates.FAILED;
  const phase =
    state.phase || (state.status === "failed" ? currentEnginePhase : "idle");
  currentEnginePhase = phase;
  event.reply("engine-state", {
    ...state,
    detail: detail || state.detail || "",
    key,
    phase,
  });
}

module.exports = {
  emitEngineState,
  setCurrentEnginePhase,
};
