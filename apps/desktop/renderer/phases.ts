(function () {
  type LifecycleStatus = "failed" | "idle" | "ready" | "starting" | "stopped" | "stopping";
  type PhaseVisualStatus = "active" | "done" | "failed" | "pending";

  type EngineState = {
    detail?: string;
    key?: string;
    phase?: string;
    status: LifecycleStatus;
  };

  type StartupPhase = {
    id: string;
    idleDetail: string;
    key?: string;
    keys?: string[];
    label: string;
  };

  type PhaseTrackerElements = {
    phaseList: HTMLElement;
    phaseSummary: HTMLElement;
  };

  const startupPhases: StartupPhase[] = [
    {
      id: "docker",
      key: "CHECKING_DOCKER",
      label: "Docker check",
      idleDetail: "Waiting for Docker daemon check",
    },
    {
      id: "image",
      keys: ["PULLING_IMAGE", "BUILDING_IMAGE"],
      label: "Image build or pull",
      idleDetail: "Waiting for image preparation",
    },
    {
      id: "cleanup",
      key: "REMOVING_STALE",
      label: "Stale container cleanup",
      idleDetail: "Waiting to remove old container",
    },
    {
      id: "container",
      key: "STARTING_CONTAINER",
      label: "Container start",
      idleDetail: "Waiting for docker run",
    },
    {
      id: "health",
      key: "WAITING_HEALTH",
      label: "Engine health wait",
      idleDetail: "Waiting for /health",
    },
    {
      id: "ready",
      key: "READY",
      label: "Ready",
      idleDetail: "Engine not ready yet",
    },
  ];

  const phaseOrder = startupPhases.map((phase) => phase.id);

  function getPhaseForState(state: EngineState) {
    if (state.phase) return state.phase;

    const match = startupPhases.find((phase) => {
      const keys = phase.keys || [phase.key];
      return keys.includes(state.key);
    });
    return match?.id || "idle";
  }

  function getPhaseLabel(phaseId: string) {
    return startupPhases.find((phase) => phase.id === phaseId)?.label || phaseId;
  }

  function getPhaseStatus(
    phaseId: string,
    activePhase: string,
    lifecycleStatus: LifecycleStatus,
  ): PhaseVisualStatus {
    if (lifecycleStatus === "ready") {
      return "done";
    }

    if (lifecycleStatus === "failed") {
      if (phaseId === activePhase) return "failed";
      return phaseOrder.indexOf(phaseId) < phaseOrder.indexOf(activePhase)
        ? "done"
        : "pending";
    }

    if (lifecycleStatus === "stopped" || lifecycleStatus === "idle") {
      return "pending";
    }

    if (phaseId === activePhase) return "active";
    return phaseOrder.indexOf(phaseId) < phaseOrder.indexOf(activePhase)
      ? "done"
      : "pending";
  }

  function getPhaseClasses(status: PhaseVisualStatus) {
    if (status === "done") {
      return {
        dot: "bg-green-400",
        item: "border-green-500/30 bg-green-500/5",
        label: "text-green-200",
        meta: "text-green-300/70",
      };
    }

    if (status === "active") {
      return {
        dot: "bg-synth-primary animate-pulse shadow-glow-primary",
        item: "border-synth-primary/50 bg-synth-primary/10",
        label: "text-white",
        meta: "text-synth-secondary",
      };
    }

    if (status === "failed") {
      return {
        dot: "bg-red-400",
        item: "border-red-500/50 bg-red-500/10",
        label: "text-red-100",
        meta: "text-red-300",
      };
    }

    return {
      dot: "bg-gray-600",
      item: "border-synth-border bg-synth-bg/40",
      label: "text-gray-400",
      meta: "text-gray-500",
    };
  }

  function getPhaseDetail(
    phase: StartupPhase,
    phaseStatus: PhaseVisualStatus,
    state: EngineState,
  ) {
    if (phaseStatus === "active" || phaseStatus === "failed") {
      return state.detail || phase.idleDetail;
    }

    if (phaseStatus === "done") {
      return phase.id === "ready" ? "Health check passed" : "Complete";
    }

    return phase.idleDetail;
  }

  function createPhaseTracker({ phaseList, phaseSummary }: PhaseTrackerElements) {
    function render(state: EngineState = { status: "idle", phase: "idle" }) {
      const activePhase = getPhaseForState(state);
      phaseSummary.innerText =
        state.status === "ready"
          ? "Ready"
          : state.status === "failed"
            ? `Failed at ${getPhaseLabel(activePhase)}`
            : state.status === "starting"
              ? `Running ${getPhaseLabel(activePhase)}`
              : "Idle";

      phaseList.innerHTML = "";
      startupPhases.forEach((phase) => {
        const phaseStatus = getPhaseStatus(phase.id, activePhase, state.status);
        const classes = getPhaseClasses(phaseStatus);
        const item = document.createElement("div");
        item.className = `flex items-start gap-3 rounded-md border px-3 py-2 ${classes.item}`;

        const dot = document.createElement("span");
        dot.className = `mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${classes.dot}`;

        const content = document.createElement("div");
        content.className = "min-w-0 flex-1";

        const label = document.createElement("div");
        label.className = `text-xs font-bold ${classes.label}`;
        label.innerText = phase.label;

        const detail = document.createElement("div");
        detail.className = `mt-0.5 break-words text-[11px] leading-4 ${classes.meta}`;
        detail.innerText = getPhaseDetail(phase, phaseStatus, state);

        content.appendChild(label);
        content.appendChild(detail);
        item.appendChild(dot);
        item.appendChild(content);
        phaseList.appendChild(item);
      });
    }

    return { render };
  }

  (window as unknown as Window & {
    PixelatedPhases: {
      createPhaseTracker: typeof createPhaseTracker;
    };
  }).PixelatedPhases = {
    createPhaseTracker,
  };
})();
