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
  regenerateLanInvite: () => void;
  revokeLanInvite: () => void;
  startDocker: (options: { exposureMode?: ExposureMode }) => void;
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
const powerText = requiredElement("power-text");
const statusBadge = requiredQuery<HTMLElement>(".status-badge");
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
const syncPanelHeights = () => {
  document.documentElement.style.setProperty(
    "--guest-access-height",
    `${guestAccessPanel.offsetHeight}px`,
  );
};
new ResizeObserver(syncPanelHeights).observe(guestAccessPanel);
window.addEventListener("resize", syncPanelHeights);
syncPanelHeights();

pixelatedWindow.PixelatedModal.bindDocsModal({
  closeButton: requiredElement("close-docs"),
  modal: requiredElement("docs-modal"),
  openButton: requiredElement("open-docs"),
});

function setStatusBadge(active: boolean) {
  if (active) {
    statusBadge.innerHTML =
      '<span class="inline-block w-2 h-2 rounded-full bg-synth-primary mr-1 animate-pulse shadow-glow-primary"></span> Engine Active';
    statusBadge.classList.replace(
      "bg-synth-primary/20",
      "bg-synth-primary/30",
    );
    powerBtn.classList.replace("bg-synth-primary", "bg-red-500");
    powerBtn.classList.replace(
      "hover:bg-synth-primary-hover",
      "hover:bg-red-600",
    );
    powerBtn.classList.remove("shadow-glow-primary");
    powerText.innerText = "Shutdown Engine";
    isRunning = true;
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

  statusBadge.innerHTML =
    '<span class="inline-block w-2 h-2 rounded-full bg-synth-primary mr-1 animate-pulse"></span> Engine Offline';
  statusBadge.classList.replace(
    "bg-synth-primary/30",
    "bg-synth-primary/20",
  );
  powerBtn.classList.replace("bg-red-500", "bg-synth-primary");
  powerBtn.classList.replace(
    "hover:bg-red-600",
    "hover:bg-synth-primary-hover",
  );
  powerBtn.classList.add("shadow-glow-primary");
  powerText.innerText = "Initialize Engine";
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
}

function resetFailedUi() {
  powerBtn.classList.replace("bg-red-500", "bg-synth-primary");
  powerBtn.classList.replace(
    "hover:bg-red-600",
    "hover:bg-synth-primary-hover",
  );
  powerBtn.classList.add("shadow-glow-primary");
  powerText.innerText = "Initialize Engine";
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
  powerBtn.disabled = false;
}

function setLifecycleState(state: EngineStatePayload) {
  const detail = state.detail ? ` - ${state.detail}` : "";
  const label = state.label || "Engine";
  statusBadge.innerHTML = `<span class="inline-block w-2 h-2 rounded-full bg-synth-primary mr-1 animate-pulse shadow-glow-primary"></span> ${label}${detail}`;
  phases.render(state);

  statusBadge.classList.toggle("text-red-400", state.status === "failed");
  statusBadge.classList.toggle("border-red-500/50", state.status === "failed");
  statusBadge.classList.toggle(
    "text-synth-primary",
    state.status !== "failed",
  );
  statusBadge.classList.toggle(
    "border-synth-primary/50",
    state.status !== "failed",
  );

  if (state.status === "ready") {
    setStatusBadge(true);
    powerBtn.disabled = false;
    exposure.setEnabled(false);
    return;
  }

  if (state.status === "failed") {
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
    powerBtn.disabled = true;
    exposure.setEnabled(false);
    powerText.innerText = label;
  }

  if (state.status === "stopping") {
    powerBtn.disabled = true;
    exposure.setEnabled(false);
    powerText.innerText = "Shutting down...";
  }
}

powerBtn.addEventListener("click", () => {
  if (!isRunning) {
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
    powerBtn.disabled = true;
    powerText.innerText = "Booting...";
    pixelatedWindow.electronAPI.startDocker({ exposureMode: exposure.getMode() });
    return;
  }

  powerBtn.disabled = true;
  powerText.innerText = "Shutting down...";
  pixelatedWindow.electronAPI.stopDocker();
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

pixelatedWindow.electronAPI.onEngineState((event, state) => {
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
