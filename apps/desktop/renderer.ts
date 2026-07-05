// IPC imported via preload script window.electronAPI

type ExposureMode = "local" | "lan";
type EngineStatus = "failed" | "ready" | "starting" | "stopped" | "stopping";

type EngineStatePayload = {
  detail?: string;
  key?: string;
  label?: string;
  phase?: string;
  status: EngineStatus;
};

type EngineExposurePayload = {
  advertisedUrls?: string[];
  companionUrls?: string[];
  exposureMode?: ExposureMode;
};

type EngineCompanionPayload = {
  certPath?: string;
  enabled?: boolean;
  error?: string;
  inviteCode?: string;
  inviteExpiresAt?: string;
  inviteRevoked?: boolean;
  inviteStatus?: string;
  urls?: string[];
};

type EngineClientPayload = {
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

type DockerDiagnosticPayload = {
  canStartDocker: boolean;
  code: string;
  detail: string;
  guidance: string;
  guideUrl: string;
  installUrl: string;
  platform: string;
  summary: string;
  title: string;
};

type EngineImageRecoveryPayload = {
  detail: string;
  engineImage: string;
  guidance: string;
  runtimeDir: string;
  runtimeKind: "libretro" | "native_linux";
  summary: string;
  title: string;
};

type LogController = {
  append: (message: string) => void;
  clear: () => void;
  sanitize: (message: string) => string;
};

type ExposureController = {
  getMode: () => ExposureMode;
  render: () => void;
  renderCompanionUrls: (urls?: string[]) => void;
  renderUrls: (urls?: string[]) => void;
  resetInviteCode: () => void;
  setCompanionStatus: (payload?: EngineCompanionPayload) => void;
  setEnabled: (enabled: boolean) => void;
};

type PhaseTracker = {
  render: (state?: EngineStatePayload) => void;
};

type ClientAccessController = {
  refresh: () => Promise<void>;
  resetActionPending: () => void;
  setControlsEnabled: (enabled: boolean) => void;
  startPolling: () => void;
  stopPolling: () => void;
};

type DockerRecoveryController = {
  setDockerRecoveryPending: (pending: boolean) => void;
  setDockerRecoveryVisible: (
    visible: boolean,
    diagnostic?: DockerDiagnosticPayload | null,
  ) => void;
  setImageBuildPending: (pending: boolean) => void;
  setImageRecoveryVisible: (
    visible: boolean,
    payload?: EngineImageRecoveryPayload | null,
  ) => void;
};

type ElectronApi = {
  createCompanionQrDataUrl: (url: string) => Promise<string>;
  launchWeb: () => Promise<void>;
  listEngineClients: () => Promise<{ clients: EngineClientPayload[] }>;
  openDockerResource: (
    resource: "guide" | "install",
    diagnosticCode: string,
  ) => Promise<void>;
  regenerateLanInvite: () => void;
  revokeEngineClient: (clientId: string) => Promise<{ disconnected: number }>;
  revokeLanInvite: () => void;
  rotateEngineToken: (options: { exposureMode?: ExposureMode }) => void;
  buildEngineImage: (options: { exposureMode?: ExposureMode }) => void;
  cancelDockerRecovery: () => void;
  startDocker: (options: { exposureMode?: ExposureMode }) => void;
  startDockerApplication: (options: { exposureMode?: ExposureMode }) => void;
  stopDocker: () => void;
  onServerLog: (callback: (event: unknown, message: string) => void) => void;
  onEngineState: (
    callback: (event: unknown, state: EngineStatePayload) => void,
  ) => void;
  onEngineStopped: (callback: (event: unknown) => void) => void;
  onEngineToken: (callback: (event: unknown, token: string) => void) => void;
  onEngineExposure: (
    callback: (event: unknown, payload: EngineExposurePayload) => void,
  ) => void;
  onEngineCompanion: (
    callback: (event: unknown, payload: EngineCompanionPayload) => void,
  ) => void;
  onDockerDiagnostic: (
    callback: (event: unknown, payload: DockerDiagnosticPayload) => void,
  ) => void;
  onDockerRecoveryStarted: (callback: (event: unknown) => void) => void;
  onDockerRecoveryReady: (callback: (event: unknown) => void) => void;
  onDockerRecoveryCancelled: (callback: (event: unknown) => void) => void;
  onEngineImageRecovery: (
    callback: (event: unknown, payload: EngineImageRecoveryPayload) => void,
  ) => void;
  onEngineImageBuildStarted: (callback: (event: unknown) => void) => void;
  onEngineImageBuildReady: (callback: (event: unknown) => void) => void;
};

type PixelatedWindow = Window &
  typeof globalThis & {
    electronAPI: ElectronApi;
    PixelatedExposure: {
      createExposureController: (elements: {
        companionCopy: HTMLElement;
        companionInviteActions: HTMLElement;
        companionInvite: HTMLElement;
        companionInviteCode: HTMLElement;
        companionInviteExpiry: HTMLElement;
        companionInviteStatus: HTMLElement;
        companionPanel: HTMLElement;
        companionQr: HTMLElement;
        companionQrImage: HTMLImageElement;
        companionQrPlaceholder: HTMLElement;
        companionQrStatus: HTMLElement;
        companionUrls: HTMLElement;
        createCompanionQrDataUrl: (url: string) => Promise<string>;
        exposureCopy: HTMLElement;
        exposureLabel: HTMLElement;
        lanToggle: HTMLInputElement;
        lanUrlPanel: HTMLElement;
        lanUrls: HTMLElement;
        lanWarning: HTMLElement;
      }) => ExposureController;
    };
    PixelatedLogs: {
      createLogController: (elements: { logBox: HTMLElement }) => LogController;
    };
    PixelatedModal: {
      bindDocsModal: (elements: {
        closeButton: HTMLElement;
        modal: HTMLElement;
        openButton: HTMLElement;
      }) => void;
    };
    PixelatedPhases: {
      createPhaseTracker: (elements: {
        phaseList: HTMLElement;
        phaseSummary: HTMLElement;
      }) => PhaseTracker;
    };
    PixelatedClients: {
      createClientAccessController: (elements: {
        clientsList: HTMLElement;
        clientsStatus: HTMLElement;
        getExposureMode: () => ExposureMode;
        getIsRunning: () => boolean;
        listEngineClients: () => Promise<{ clients: EngineClientPayload[] }>;
        revokeEngineClient: (
          clientId: string,
        ) => Promise<{ disconnected: number }>;
        rotateEngineToken: (options: { exposureMode?: ExposureMode }) => void;
        rotateTokenButton: HTMLButtonElement;
      }) => ClientAccessController;
    };
    PixelatedRecovery: {
      createDockerRecoveryController: (elements: {
        buildEngineImage: (options: { exposureMode?: ExposureMode }) => void;
        buildImageButton: HTMLButtonElement;
        cancelDockerRecovery: () => void;
        copyDiagnosticsButton: HTMLButtonElement;
        desktopPanels: HTMLElement;
        downloadButton: HTMLButtonElement;
        getExposureMode: () => ExposureMode;
        guideButton: HTMLButtonElement;
        guidance: HTMLElement;
        initializeEngine: () => void;
        logs: LogController;
        openDockerResource: (
          resource: "guide" | "install",
          diagnosticCode: string,
        ) => Promise<void>;
        panel: HTMLElement;
        retryButton: HTMLButtonElement;
        startButton: HTMLButtonElement;
        startDockerApplication: (options: { exposureMode?: ExposureMode }) => void;
        startupPanel: HTMLElement;
        syncPanelHeights: () => void;
        title: HTMLElement;
      }) => DockerRecoveryController;
    };
  };

const pixelatedWindow = window as PixelatedWindow;

function requiredElement<T extends HTMLElement>(id: string, type?: {
  new (): T;
}): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing desktop UI element: #${id}`);
  }

  if (type && !(element instanceof type)) {
    throw new Error(`Desktop UI element #${id} has an unexpected type.`);
  }

  return element as T;
}

function requiredQuery<T extends Element>(selector: string): T {
  const element = document.querySelector(selector);
  if (!element) {
    throw new Error(`Missing desktop UI element: ${selector}`);
  }

  return element as T;
}

const powerBtn = requiredElement("power-btn", HTMLButtonElement);
const powerIcon = requiredElement("power-icon");
const powerSpinner = requiredElement("power-spinner");
const powerText = requiredElement("power-text");
const launchWebBtn = requiredElement("launch-web", HTMLButtonElement);
const startupPanel = requiredElement("startup-panel");
const statusBadge = requiredQuery<HTMLElement>(".status-badge");
const statusDot = requiredElement("status-dot");
const statusText = requiredElement("status-text");
const tokenPanel = requiredElement("token-panel");
const tokenValue = requiredElement("engine-token");
const copyTokenBtn = requiredElement("copy-token", HTMLButtonElement);
const clearLogsBtn = requiredElement("clear-logs", HTMLButtonElement);
const copyCompanionBtn = requiredElement("copy-companion", HTMLButtonElement);
const regenerateInviteBtn = requiredElement(
  "regenerate-invite",
  HTMLButtonElement,
);
const revokeInviteBtn = requiredElement("revoke-invite", HTMLButtonElement);

let isRunning = false;
let pendingCompanionPayload: EngineCompanionPayload | null = null;

function initializeEngine() {
  recovery.setDockerRecoveryVisible(false);
  recovery.setImageRecoveryVisible(false);
  logs.clear();
  tokenPanel.classList.add("hidden");
  tokenValue.innerText = "";
  exposure.renderUrls([]);
  exposure.renderCompanionUrls([]);
  exposure.resetInviteCode();
  pendingCompanionPayload = null;
  logs.append(
    '<span class="text-gray-400">>></span> Initializing WebRTC node...',
  );
  phases.render({
    detail: "Queued",
    phase: "docker",
    status: "starting",
  });
  setStatusPresentation("Initializing Engine - Queued", "running");
  setPowerPending(true);
  powerText.innerText = "Initialize Engine";
  pixelatedWindow.electronAPI.startDocker({ exposureMode: exposure.getMode() });
}

function setInviteButtonsPending(isPending: boolean) {
  regenerateInviteBtn.disabled = isPending;
  revokeInviteBtn.disabled = isPending;
  if (isPending) {
    regenerateInviteBtn.innerText = "Updating...";
    return;
  }

  regenerateInviteBtn.innerText = "Regenerate";
  revokeInviteBtn.innerText = "Revoke";
}

const logs = pixelatedWindow.PixelatedLogs.createLogController({
  logBox: requiredElement("log"),
});
const exposure = pixelatedWindow.PixelatedExposure.createExposureController({
  companionCopy: requiredElement("companion-copy"),
  companionInviteActions: requiredElement("companion-invite-actions"),
  companionInvite: requiredElement("companion-invite"),
  companionInviteCode: requiredElement("companion-invite-code"),
  companionInviteExpiry: requiredElement("companion-invite-expiry"),
  companionInviteStatus: requiredElement("companion-invite-status"),
  companionPanel: requiredElement("companion-panel"),
  companionQr: requiredElement("companion-qr"),
  companionQrImage: requiredElement("companion-qr-image", HTMLImageElement),
  companionQrPlaceholder: requiredElement("companion-qr-placeholder"),
  companionQrStatus: requiredElement("companion-qr-status"),
  companionUrls: requiredElement("companion-urls"),
  createCompanionQrDataUrl: pixelatedWindow.electronAPI.createCompanionQrDataUrl,
  exposureCopy: requiredElement("exposure-copy"),
  exposureLabel: requiredElement("exposure-label"),
  lanToggle: requiredElement("lan-toggle", HTMLInputElement),
  lanUrlPanel: requiredElement("lan-url-panel"),
  lanUrls: requiredElement("lan-urls"),
  lanWarning: requiredElement("lan-warning"),
});
const phases = pixelatedWindow.PixelatedPhases.createPhaseTracker({
  phaseList: requiredElement("phase-list"),
  phaseSummary: requiredElement("phase-summary"),
});
const guestAccessPanel = requiredElement("guest-access-panel");
const desktopPanels = requiredElement("desktop-panels");
const syncPanelHeights = () => {
  if (startupPanel.classList.contains("recovery-active")) {
    desktopPanels.style.setProperty(
      "--startup-recovery-height",
      `${startupPanel.scrollHeight}px`,
    );
    return;
  }
  document.documentElement.style.setProperty(
    "--guest-access-height",
    `${guestAccessPanel.offsetHeight}px`,
  );
};
new ResizeObserver(syncPanelHeights).observe(guestAccessPanel);
new ResizeObserver(syncPanelHeights).observe(startupPanel);
window.addEventListener("resize", syncPanelHeights);
syncPanelHeights();

pixelatedWindow.PixelatedModal.bindDocsModal({
  closeButton: requiredElement("close-docs"),
  modal: requiredElement("docs-modal"),
  openButton: requiredElement("open-docs"),
});

const recovery = pixelatedWindow.PixelatedRecovery.createDockerRecoveryController({
  buildEngineImage: pixelatedWindow.electronAPI.buildEngineImage,
  buildImageButton: requiredElement("docker-build-image", HTMLButtonElement),
  cancelDockerRecovery: pixelatedWindow.electronAPI.cancelDockerRecovery,
  copyDiagnosticsButton: requiredElement(
    "docker-copy-diagnostics",
    HTMLButtonElement,
  ),
  desktopPanels,
  downloadButton: requiredElement("docker-download", HTMLButtonElement),
  getExposureMode: exposure.getMode,
  guideButton: requiredElement("docker-guide", HTMLButtonElement),
  guidance: requiredElement("docker-recovery-guidance"),
  initializeEngine,
  logs,
  openDockerResource: pixelatedWindow.electronAPI.openDockerResource,
  panel: requiredElement("docker-recovery"),
  retryButton: requiredElement("docker-retry", HTMLButtonElement),
  startButton: requiredElement("docker-start", HTMLButtonElement),
  startDockerApplication: pixelatedWindow.electronAPI.startDockerApplication,
  startupPanel,
  syncPanelHeights,
  title: requiredElement("docker-recovery-title"),
});

const clients = pixelatedWindow.PixelatedClients.createClientAccessController({
  clientsList: requiredElement("clients-list"),
  clientsStatus: requiredElement("clients-status"),
  getExposureMode: exposure.getMode,
  getIsRunning: () => isRunning,
  listEngineClients: pixelatedWindow.electronAPI.listEngineClients,
  revokeEngineClient: pixelatedWindow.electronAPI.revokeEngineClient,
  rotateEngineToken: pixelatedWindow.electronAPI.rotateEngineToken,
  rotateTokenButton: requiredElement("rotate-token", HTMLButtonElement),
});

type StatusTone = "offline" | "ready" | "running";

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

function setStatusPresentation(text: string, tone: StatusTone) {
  const toneClasses = {
    offline: {
      badge: ["border-red-500/70", "bg-red-500/20", "text-red-200"],
      dot: "bg-red-500",
    },
    ready: {
      badge: ["border-emerald-500/50", "bg-emerald-500/10", "text-emerald-300"],
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
  const allBadgeClasses = Object.values(toneClasses).flatMap(
    ({ badge }) => badge,
  );
  const allDotClasses = Object.values(toneClasses).map(({ dot }) => dot);

  statusBadge.classList.remove(...allBadgeClasses);
  statusDot.classList.remove(...allDotClasses, "animate-pulse");
  statusBadge.classList.add(...toneClasses[tone].badge);
  statusDot.classList.add(toneClasses[tone].dot);
  if (tone === "running") statusDot.classList.add("animate-pulse");
  statusText.innerText = text;
  statusBadge.title = text;
}

function setPowerPending(pending: boolean) {
  powerIcon.classList.toggle("hidden", pending);
  powerSpinner.classList.toggle("hidden", !pending);
  powerBtn.disabled = pending;
}

function setLaunchWebVisible(visible: boolean) {
  launchWebBtn.classList.toggle("hidden", !visible);
  launchWebBtn.classList.toggle("flex", visible);
}

function setStatusBadge(active: boolean) {
  if (active) {
    setStatusPresentation("Engine Ready", "ready");
    powerBtn.classList.replace("bg-synth-primary", "bg-synth-action");
    powerBtn.classList.replace(
      "hover:bg-synth-primary-hover",
      "hover:bg-synth-action-hover",
    );
    powerBtn.classList.remove("shadow-panel");
    powerText.innerText = "Shutdown Engine";
    setPowerPending(false);
    setLaunchWebVisible(true);
    isRunning = true;
    clients.startPolling();
    if (pendingCompanionPayload) {
      exposure.setCompanionStatus(pendingCompanionPayload);
      setInviteButtonsPending(false);
      regenerateInviteBtn.disabled = !pendingCompanionPayload.enabled;
      revokeInviteBtn.disabled =
        !pendingCompanionPayload.enabled ||
        Boolean(pendingCompanionPayload.inviteRevoked);
      pendingCompanionPayload = null;
    }
    return;
  }

  setStatusPresentation("Engine Offline", "offline");
  powerBtn.classList.replace("bg-synth-action", "bg-synth-primary");
  powerBtn.classList.replace(
    "hover:bg-synth-action-hover",
    "hover:bg-synth-primary-hover",
  );
  powerBtn.classList.add("shadow-panel");
  powerText.innerText = "Initialize Engine";
  setPowerPending(false);
  setLaunchWebVisible(false);
  tokenPanel.classList.add("hidden");
  tokenValue.innerText = "";
  exposure.renderUrls([]);
  exposure.renderCompanionUrls([]);
  exposure.resetInviteCode();
  pendingCompanionPayload = null;
  regenerateInviteBtn.disabled = true;
  revokeInviteBtn.disabled = true;
  exposure.setEnabled(true);
  phases.render({ status: "stopped", phase: "idle" });
  isRunning = false;
  clients.stopPolling();
}

function resetFailedUi() {
  powerBtn.classList.replace("bg-synth-action", "bg-synth-primary");
  powerBtn.classList.replace(
    "hover:bg-synth-action-hover",
    "hover:bg-synth-primary-hover",
  );
  powerBtn.classList.add("shadow-panel");
  powerText.innerText = "Initialize Engine";
  setPowerPending(false);
  setLaunchWebVisible(false);
  tokenPanel.classList.add("hidden");
  tokenValue.innerText = "";
  exposure.renderUrls([]);
  exposure.renderCompanionUrls([]);
  exposure.resetInviteCode();
  pendingCompanionPayload = null;
  regenerateInviteBtn.disabled = true;
  revokeInviteBtn.disabled = true;
  exposure.setEnabled(true);
  isRunning = false;
  clients.stopPolling();
}

function setLifecycleState(state: EngineStatePayload) {
  const statusLabel = getCompactLifecycleStatus(state);
  phases.render(state);

  if (state.status === "ready") {
    recovery.setDockerRecoveryVisible(false);
    setStatusBadge(true);
    powerBtn.disabled = false;
    exposure.setEnabled(false);
    return;
  }

  if (state.status === "failed") {
    setStatusPresentation(statusLabel, "offline");
    resetFailedUi();
    return;
  }

  if (state.status === "stopped") {
    setStatusBadge(false);
    powerBtn.disabled = false;
    exposure.setEnabled(true);
    return;
  }

  if (state.status === "starting") {
    setLaunchWebVisible(false);
    setStatusPresentation(statusLabel, "running");
    setPowerPending(true);
    exposure.setEnabled(false);
    powerText.innerText = "Initialize Engine";
  }

  if (state.status === "stopping") {
    setLaunchWebVisible(false);
    setStatusPresentation(statusLabel, "running");
    setPowerPending(true);
    exposure.setEnabled(false);
    powerText.innerText = "Shutdown Engine";
  }
}

powerBtn.addEventListener("click", () => {
  if (!isRunning) {
    initializeEngine();
    return;
  }

  setStatusPresentation("Stopping Engine", "running");
  setPowerPending(true);
  powerText.innerText = "Shutdown Engine";
  pixelatedWindow.electronAPI.stopDocker();
});

launchWebBtn.addEventListener("click", async () => {
  launchWebBtn.disabled = true;
  try {
    await pixelatedWindow.electronAPI.launchWeb();
  } catch (err) {
    logs.append(
      `<span class="text-red-400">Could not launch the web app: ${logs.sanitize(String(err))}</span>`,
    );
  } finally {
    launchWebBtn.disabled = false;
  }
});

clearLogsBtn.addEventListener("click", () => {
  logs.clear();
});

copyTokenBtn.addEventListener("click", async () => {
  if (!tokenValue.innerText) return;

  try {
    await navigator.clipboard.writeText(tokenValue.innerText);
    copyTokenBtn.innerText = "Copied";
    setTimeout(() => {
      copyTokenBtn.innerText = "Copy";
    }, 1200);
  } catch (err) {
    logs.append(
      '<span class="text-red-400">Failed to copy token. Select it manually.</span>',
    );
  }
});

copyCompanionBtn.addEventListener("click", async () => {
  const url = document.querySelector<HTMLElement>("#companion-urls code")?.innerText;
  if (!url) return;

  try {
    await navigator.clipboard.writeText(url);
    copyCompanionBtn.innerText = "Copied";
    setTimeout(() => {
      copyCompanionBtn.innerText = "Copy";
    }, 1200);
  } catch (err) {
    logs.append(
      '<span class="text-red-400">Failed to copy HTTPS join page. Select it manually.</span>',
    );
  }
});

regenerateInviteBtn.addEventListener("click", () => {
  setInviteButtonsPending(true);
  pixelatedWindow.electronAPI.regenerateLanInvite();
});

revokeInviteBtn.addEventListener("click", () => {
  setInviteButtonsPending(true);
  pixelatedWindow.electronAPI.revokeLanInvite();
});

pixelatedWindow.electronAPI.onEngineToken((event, token) => {
  tokenValue.innerText = token;
  tokenPanel.classList.remove("hidden");
});

pixelatedWindow.electronAPI.onEngineExposure((event, payload) => {
  exposure.renderUrls(payload.advertisedUrls || []);
  exposure.renderCompanionUrls(payload.companionUrls || []);
});

pixelatedWindow.electronAPI.onEngineCompanion((event, payload) => {
  if (!isRunning) {
    pendingCompanionPayload = payload;
    return;
  }

  exposure.setCompanionStatus(payload);
  setInviteButtonsPending(false);
  regenerateInviteBtn.disabled = !payload.enabled;
  revokeInviteBtn.disabled = !payload.enabled || Boolean(payload.inviteRevoked);
});

pixelatedWindow.electronAPI.onDockerDiagnostic((event, payload) => {
  recovery.setDockerRecoveryVisible(true, payload);
  logs.append(
    `<span class="text-red-400">${logs.sanitize(payload.title)}</span>`,
  );
  logs.append(
    `<span class="text-gray-400">Platform: ${logs.sanitize(payload.platform)} | Diagnostic: ${logs.sanitize(payload.code)}</span>`,
  );
});

pixelatedWindow.electronAPI.onEngineImageRecovery((event, payload) => {
  recovery.setImageRecoveryVisible(true, payload);
  logs.append(
    `<span class="text-red-400">${logs.sanitize(payload.title)}</span>`,
  );
  logs.append(
    `<span class="text-gray-400">Image: ${logs.sanitize(payload.engineImage)} | Runtime: ${logs.sanitize(payload.runtimeKind)}</span>`,
  );
});

pixelatedWindow.electronAPI.onDockerRecoveryStarted(() => {
  recovery.setDockerRecoveryPending(true);
});

pixelatedWindow.electronAPI.onDockerRecoveryReady(() => {
  recovery.setDockerRecoveryVisible(false);
});

pixelatedWindow.electronAPI.onDockerRecoveryCancelled(() => {
  recovery.setDockerRecoveryPending(false);
});

pixelatedWindow.electronAPI.onEngineImageBuildStarted(() => {
  recovery.setImageBuildPending(true);
});

pixelatedWindow.electronAPI.onEngineImageBuildReady(() => {
  recovery.setImageRecoveryVisible(false);
});

pixelatedWindow.electronAPI.onEngineState((event, state) => {
  if (state.status === "ready" || state.status === "failed" || state.status === "stopped") {
    clients.resetActionPending();
  }
  setLifecycleState(state);
});

pixelatedWindow.electronAPI.onServerLog((event, message) => {
  logs.append(
    `<span class="text-synth-primary">SYS</span> ${logs.sanitize(message)}`,
  );
});

pixelatedWindow.electronAPI.onEngineStopped(() => {
  powerBtn.disabled = false;
});

exposure.render();
phases.render();
regenerateInviteBtn.disabled = true;
revokeInviteBtn.disabled = true;
clients.setControlsEnabled(false);
