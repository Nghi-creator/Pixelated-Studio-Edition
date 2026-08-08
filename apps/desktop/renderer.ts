// IPC imported via preload script window.electronAPI

const pixelatedWindow = window as PixelatedWindow;

function requiredElement<T extends HTMLElement>(id: string, type?: {
  new (): T;
}): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing desktop UI element: #${id}`);
  if (type && !(element instanceof type)) {
    throw new Error(`Desktop UI element #${id} has an unexpected type.`);
  }
  return element as T;
}

function requiredQuery<T extends Element>(selector: string): T {
  const element = document.querySelector(selector);
  if (!element) throw new Error(`Missing desktop UI element: ${selector}`);
  return element as T;
}

const powerBtn = requiredElement("power-btn", HTMLButtonElement);
const powerIcon = requiredElement("power-icon");
const powerSpinner = requiredElement("power-spinner");
const powerText = requiredElement("power-text");
const launchWebBtn = requiredElement("launch-web", HTMLButtonElement);
const startupPanel = requiredElement("startup-panel");
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

const setStatusPresentation =
  pixelatedWindow.PixelatedStatus.createStatusPresenter({
    statusBadge: requiredQuery<HTMLElement>(".status-badge"),
    statusDot: requiredElement("status-dot"),
    statusText: requiredElement("status-text"),
  });
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

let lifecycle: DesktopLifecycleController | null = null;
const initializeEngine = () => {
  if (!lifecycle) throw new Error("Desktop lifecycle has not been initialized.");
  lifecycle.initializeEngine();
};

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
  getIsRunning: () => lifecycle?.getIsRunning() || false,
  listEngineClients: pixelatedWindow.electronAPI.listEngineClients,
  revokeEngineClient: pixelatedWindow.electronAPI.revokeEngineClient,
  rotateEngineToken: pixelatedWindow.electronAPI.rotateEngineToken,
  rotateTokenButton: requiredElement("rotate-token", HTMLButtonElement),
});

lifecycle = pixelatedWindow.PixelatedLifecycle.createLifecycleController({
  clients,
  electronApi: pixelatedWindow.electronAPI,
  exposure,
  getCompactLifecycleStatus:
    pixelatedWindow.PixelatedStatus.getCompactLifecycleStatus,
  launchWebButton: launchWebBtn,
  logs,
  phases,
  powerButton: powerBtn,
  powerIcon,
  powerSpinner,
  powerText,
  recovery,
  regenerateInviteButton: regenerateInviteBtn,
  revokeInviteButton: revokeInviteBtn,
  setStatusPresentation,
  tokenPanel,
  tokenValue,
});

pixelatedWindow.PixelatedEvents.bindRendererEvents({
  clearLogsButton: clearLogsBtn,
  clients,
  companionCopyButton: copyCompanionBtn,
  electronApi: pixelatedWindow.electronAPI,
  exposure,
  getIsRunning: lifecycle.getIsRunning,
  handleEngineCompanion: lifecycle.handleEngineCompanion,
  initializeEngine: lifecycle.initializeEngine,
  launchWebButton: launchWebBtn,
  logs,
  powerButton: powerBtn,
  powerText,
  recovery,
  regenerateInviteButton: regenerateInviteBtn,
  revokeInviteButton: revokeInviteBtn,
  setLifecycleState: lifecycle.setLifecycleState,
  setPowerPending: lifecycle.setPowerPending,
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
