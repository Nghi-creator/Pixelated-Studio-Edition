// IPC imported via preload script window.electronAPI

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
const setStatusPresentation =
  pixelatedWindow.PixelatedStatus.createStatusPresenter({
    statusBadge,
    statusDot,
    statusText,
  });
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
  const statusLabel =
    pixelatedWindow.PixelatedStatus.getCompactLifecycleStatus(state);
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

function handleEngineCompanion(payload: EngineCompanionPayload) {
  if (!isRunning) {
    pendingCompanionPayload = payload;
    return;
  }

  exposure.setCompanionStatus(payload);
  setInviteButtonsPending(false);
  regenerateInviteBtn.disabled = !payload.enabled;
  revokeInviteBtn.disabled = !payload.enabled || Boolean(payload.inviteRevoked);
}

pixelatedWindow.PixelatedEvents.bindRendererEvents({
  clearLogsButton: clearLogsBtn,
  clients,
  companionCopyButton: copyCompanionBtn,
  electronApi: pixelatedWindow.electronAPI,
  exposure,
  getIsRunning: () => isRunning,
  handleEngineCompanion,
  initializeEngine,
  launchWebButton: launchWebBtn,
  logs,
  powerButton: powerBtn,
  powerText,
  recovery,
  regenerateInviteButton: regenerateInviteBtn,
  revokeInviteButton: revokeInviteBtn,
  setLifecycleState,
  setPowerPending,
  setStatusPresentation,
  tokenPanel,
  tokenCopyButton: copyTokenBtn,
  tokenValue,
});

exposure.render();
phases.render();
regenerateInviteBtn.disabled = true;
revokeInviteBtn.disabled = true;
clients.setControlsEnabled(false);
