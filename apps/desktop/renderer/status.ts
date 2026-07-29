(function () {
  function compactFailedStatus(state: EngineStatePayload) {
    const detail = (state.detail || "").toLowerCase();
    if (detail.includes("no such container")) return "Container Not Found";
    if (
      detail.includes("port is already allocated") ||
      detail.includes("bind for 0.0.0.0:8080 failed") ||
      detail.includes("bind for 127.0.0.1:8080 failed")
    ) {
      return "Port 8080 Busy";
    }
    if (state.phase === "docker") return "Docker Unavailable";
    if (state.phase === "image") return "Image Not Ready";
    if (state.phase === "cleanup") return "Cleanup Failed";
    if (state.phase === "container") return "Container Failed";
    if (state.phase === "health") return "Health Check Failed";
    return "Engine Failed";
  }

  function compactStartingStatus(state: EngineStatePayload) {
    const labels: Record<string, string> = {
      BUILDING_IMAGE: "Building Image",
      CHECKING_DOCKER: "Checking Docker",
      PULLING_IMAGE: "Pulling Image",
      REMOVING_STALE: "Cleaning Container",
      STARTING_CONTAINER: "Starting Container",
      WAITING_HEALTH: "Checking Health",
    };
    if (state.key && labels[state.key]) return labels[state.key];
    if (state.phase === "docker") return "Checking Docker";
    if (state.phase === "image") return "Preparing Image";
    if (state.phase === "cleanup") return "Cleaning Container";
    if (state.phase === "container") return "Starting Container";
    if (state.phase === "health") return "Checking Health";
    return "Starting Engine";
  }

  function getCompactLifecycleStatus(state: EngineStatePayload) {
    if (state.status === "failed") return compactFailedStatus(state);
    if (state.status === "starting") return compactStartingStatus(state);
    if (state.status === "stopping") return "Stopping Engine";
    if (state.status === "ready") return "Engine Ready";
    return "Engine Offline";
  }

  function createStatusPresenter({
    statusBadge,
    statusDot,
    statusText,
  }: {
    statusBadge: HTMLElement;
    statusDot: HTMLElement;
    statusText: HTMLElement;
  }) {
    const toneClasses = {
      offline: {
        badge: ["border-red-500/70", "bg-red-500/20", "text-red-200"],
        dot: "bg-red-500",
      },
      ready: {
        badge: [
          "border-emerald-500/50",
          "bg-emerald-500/10",
          "text-emerald-300",
        ],
        dot: "bg-emerald-400",
      },
      running: {
        badge: [
          "border-synth-action/60",
          "bg-synth-action/15",
          "text-synth-secondary",
        ],
        dot: "bg-synth-secondary",
      },
    } as const;

    return (text: string, tone: StatusTone) => {
      statusBadge.classList.remove(
        ...Object.values(toneClasses).flatMap(({ badge }) => badge),
      );
      statusDot.classList.remove(
        ...Object.values(toneClasses).map(({ dot }) => dot),
        "animate-pulse",
      );
      statusBadge.classList.add(...toneClasses[tone].badge);
      statusDot.classList.add(toneClasses[tone].dot);
      if (tone === "running") statusDot.classList.add("animate-pulse");
      statusText.innerText = text;
      statusBadge.title = text;
    };
  }

  (window as unknown as Window & {
    PixelatedStatus: {
      createStatusPresenter: typeof createStatusPresenter;
      getCompactLifecycleStatus: typeof getCompactLifecycleStatus;
    };
  }).PixelatedStatus = {
    createStatusPresenter,
    getCompactLifecycleStatus,
  };
})();
