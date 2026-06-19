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
const dockerRecovery = requiredElement("docker-recovery");
const dockerRecoveryTitle = requiredElement("docker-recovery-title");
const dockerRecoveryGuidance = requiredElement("docker-recovery-guidance");
const dockerRetryBtn = requiredElement("docker-retry", HTMLButtonElement);
const dockerStartBtn = requiredElement("docker-start", HTMLButtonElement);
const dockerDownloadBtn = requiredElement("docker-download", HTMLButtonElement);
const dockerGuideBtn = requiredElement("docker-guide", HTMLButtonElement);
const dockerCopyDiagnosticsBtn = requiredElement(
  "docker-copy-diagnostics",
  HTMLButtonElement,
);
const clientsList = requiredElement("clients-list");
const clientsStatus = requiredElement("clients-status");
const rotateTokenBtn = requiredElement("rotate-token", HTMLButtonElement);

let isRunning = false;
let pendingCompanionPayload: EngineCompanionPayload | null = null;
let dockerDiagnostic: DockerDiagnosticPayload | null = null;
let dockerRecoveryPending = false;
let clientsActionPending = false;
let clientsPollTimer: number | null = null;

function setDockerRecoveryPending(pending: boolean) {
  dockerRecoveryPending = pending;
  dockerStartBtn.innerText = pending ? "Cancel waiting" : "Start Docker";
  dockerRetryBtn.disabled = pending;
  dockerDownloadBtn.disabled = pending;
  dockerGuideBtn.disabled = pending;
}

function setDockerRecoveryVisible(
  visible: boolean,
  diagnostic: DockerDiagnosticPayload | null = null,
) {
  dockerDiagnostic = visible ? diagnostic : null;
  dockerRecovery.classList.toggle("hidden", !visible);
  startupPanel.classList.toggle("recovery-active", visible);
  if (!visible) {
    desktopPanels.style.removeProperty("--startup-recovery-height");
  }
  requestAnimationFrame(syncPanelHeights);
  if (!visible || !diagnostic) return;

  dockerRecoveryTitle.innerText = diagnostic.title;
  dockerRecoveryGuidance.innerText = diagnostic.guidance;
  dockerDownloadBtn.classList.toggle(
    "hidden",
    diagnostic.code !== "cli_missing",
  );
  dockerStartBtn.classList.toggle("hidden", !diagnostic.canStartDocker);
  setDockerRecoveryPending(false);
}

function initializeEngine() {
  setDockerRecoveryVisible(false);
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

function formatClientScope(scope: EngineClientPayload["accessScope"]) {
  if (scope === "companion-guest") return "LAN guest";
  if (scope === "companion-host") return "Host launch";
  return "Raw token";
}

function formatClientRole(role: string) {
  if (role === "host") return "Host";
  if (role === "spectator") return "Spectator";
  if (role === "player") return "Player";
  if (role === "camera") return "Camera";
  return "Connected";
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function setClientControlsEnabled(enabled: boolean) {
  rotateTokenBtn.disabled = !enabled || clientsActionPending;
}

function renderClients(clients: EngineClientPayload[]) {
  clientsList.replaceChildren();

  if (!isRunning) {
    clientsStatus.innerText = "Start the engine to see connected browser clients.";
    setClientControlsEnabled(false);
    return;
  }

  setClientControlsEnabled(true);

  const visibleClients = clients.filter((client) => client.role !== "camera");
  if (visibleClients.length === 0) {
    clientsStatus.innerText =
      "No browser clients are connected yet. Same-browser tabs will appear as separate connections.";
    return;
  }

  clientsStatus.innerText = `${visibleClients.length} browser client${
    visibleClients.length === 1 ? "" : "s"
  } connected.`;

  for (const client of visibleClients) {
    const card = document.createElement("article");
    card.className =
      "rounded-lg border border-synth-border bg-[#050810] p-3 text-xs shadow-inner";

    const header = document.createElement("div");
    header.className = "flex items-start justify-between gap-3";

    const title = document.createElement("p");
    title.className = "font-bold text-white";
    title.innerText = `${formatClientScope(client.accessScope)} · ${formatClientRole(
      client.role,
    )}`;

    const revokeButton = document.createElement("button");
    revokeButton.className =
      "shrink-0 rounded-md border border-red-400/50 bg-red-500/10 px-2.5 py-1 text-[11px] font-bold text-red-200 transition-colors hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50";
    revokeButton.disabled = clientsActionPending;
    revokeButton.type = "button";
    revokeButton.innerText = "Revoke";
    revokeButton.addEventListener("click", () => {
      void revokeClient(client.id);
    });

    const lastSeen = document.createElement("span");
    lastSeen.className = "text-gray-500";
    lastSeen.innerText = `Seen ${formatTimestamp(client.lastSeenAt)} · ${
      client.socketCount
    } socket${client.socketCount === 1 ? "" : "s"}`;

    const titleGroup = document.createElement("div");
    titleGroup.append(title, lastSeen);

    header.append(titleGroup, revokeButton);

    const details = document.createElement("p");
    details.className = "mt-2 break-all font-mono leading-5 text-synth-secondary";
    details.innerText = `${client.remoteAddress}${
      client.sessionId ? ` · ${client.sessionId}` : ""
    }`;

    const userAgent = document.createElement("p");
    userAgent.className = "mt-1 line-clamp-2 leading-5 text-gray-500";
    userAgent.innerText = client.userAgent;

    card.append(header, details, userAgent);
    clientsList.append(card);
  }
}

async function revokeClient(clientId: string) {
  if (!isRunning || clientsActionPending) return;
  clientsActionPending = true;
  setClientControlsEnabled(false);
  clientsStatus.innerText = "Revoking selected browser client...";

  try {
    await pixelatedWindow.electronAPI.revokeEngineClient(clientId);
  } catch (err) {
    clientsStatus.innerText = `Could not revoke client: ${String(err)}`;
  } finally {
    clientsActionPending = false;
    await refreshClients();
  }
}

async function refreshClients() {
  if (!isRunning) {
    renderClients([]);
    return;
  }

  try {
    const { clients } = await pixelatedWindow.electronAPI.listEngineClients();
    renderClients(clients);
  } catch (err) {
    clientsStatus.innerText = `Could not load connected clients: ${String(err)}`;
    clientsList.replaceChildren();
    setClientControlsEnabled(true);
  }
}

function startClientsPolling() {
  if (clientsPollTimer !== null) return;
  void refreshClients();
  clientsPollTimer = window.setInterval(() => {
    void refreshClients();
  }, 3_000);
}

function stopClientsPolling() {
  if (clientsPollTimer !== null) {
    window.clearInterval(clientsPollTimer);
    clientsPollTimer = null;
  }
  renderClients([]);
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

type StatusTone = "offline" | "ready" | "running";

function setStatusPresentation(text: string, tone: StatusTone) {
  const toneClasses = {
    offline: {
      badge: ["border-red-500/50", "bg-red-500/10", "text-red-300"],
      dot: "bg-red-400",
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
    startClientsPolling();
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
  stopClientsPolling();
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
  stopClientsPolling();
}

function setLifecycleState(state: EngineStatePayload) {
  const detail = state.detail ? ` - ${state.detail}` : "";
  const label = state.label || "Engine";
  const statusLabel = `${label}${detail}`;
  phases.render(state);

  if (state.status === "ready") {
    setDockerRecoveryVisible(false);
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

dockerRetryBtn.addEventListener("click", initializeEngine);

dockerStartBtn.addEventListener("click", () => {
  if (dockerRecoveryPending) {
    pixelatedWindow.electronAPI.cancelDockerRecovery();
    return;
  }

  setDockerRecoveryPending(true);
  pixelatedWindow.electronAPI.startDockerApplication({
    exposureMode: exposure.getMode(),
  });
});

async function openDockerResource(resource: "guide" | "install") {
  if (!dockerDiagnostic) return;

  dockerRetryBtn.disabled = true;
  dockerDownloadBtn.disabled = true;
  dockerGuideBtn.disabled = true;
  try {
    await pixelatedWindow.electronAPI.openDockerResource(
      resource,
      dockerDiagnostic.code,
    );
  } catch (err) {
    logs.append(
      `<span class="text-red-400">Could not open Docker guidance: ${logs.sanitize(String(err))}</span>`,
    );
  } finally {
    if (!dockerRecoveryPending) {
      dockerRetryBtn.disabled = false;
      dockerDownloadBtn.disabled = false;
      dockerGuideBtn.disabled = false;
    }
  }
}

dockerDownloadBtn.addEventListener("click", () => {
  void openDockerResource("install");
});

dockerGuideBtn.addEventListener("click", () => {
  void openDockerResource("guide");
});

dockerCopyDiagnosticsBtn.addEventListener("click", async () => {
  if (!dockerDiagnostic) return;

  try {
    await navigator.clipboard.writeText(dockerDiagnostic.summary);
    dockerCopyDiagnosticsBtn.innerText = "Copied";
    setTimeout(() => {
      dockerCopyDiagnosticsBtn.innerText = "Copy diagnostics";
    }, 1200);
  } catch {
    logs.append(
      '<span class="text-red-400">Failed to copy the sanitized Docker diagnostic.</span>',
    );
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

rotateTokenBtn.addEventListener("click", () => {
  if (!isRunning || clientsActionPending) return;
  clientsActionPending = true;
  setClientControlsEnabled(false);
  clientsStatus.innerText = "Rotating token and restarting engine...";
  pixelatedWindow.electronAPI.rotateEngineToken({
    exposureMode: exposure.getMode(),
  });
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
  setDockerRecoveryVisible(true, payload);
  logs.append(
    `<span class="text-red-400">${logs.sanitize(payload.title)}</span>`,
  );
  logs.append(
    `<span class="text-gray-400">Platform: ${logs.sanitize(payload.platform)} | Diagnostic: ${logs.sanitize(payload.code)}</span>`,
  );
});

pixelatedWindow.electronAPI.onDockerRecoveryStarted(() => {
  setDockerRecoveryPending(true);
});

pixelatedWindow.electronAPI.onDockerRecoveryReady(() => {
  setDockerRecoveryVisible(false);
});

pixelatedWindow.electronAPI.onDockerRecoveryCancelled(() => {
  setDockerRecoveryPending(false);
});

pixelatedWindow.electronAPI.onEngineState((event, state) => {
  if (state.status === "ready" || state.status === "failed" || state.status === "stopped") {
    clientsActionPending = false;
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
setClientControlsEnabled(false);
