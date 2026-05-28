// IPC imported via preload script window.electronAPI

const powerBtn = document.getElementById("power-btn");
const powerText = document.getElementById("power-text");
const statusBadge = document.querySelector(".status-badge");
const tokenPanel = document.getElementById("token-panel");
const tokenValue = document.getElementById("engine-token");
const copyTokenBtn = document.getElementById("copy-token");

let isRunning = false;

const logs = window.PixelatedLogs.createLogController({
  logBox: document.getElementById("log"),
});
const exposure = window.PixelatedExposure.createExposureController({
  exposureCopy: document.getElementById("exposure-copy"),
  exposureLabel: document.getElementById("exposure-label"),
  lanToggle: document.getElementById("lan-toggle"),
  lanUrlPanel: document.getElementById("lan-url-panel"),
  lanUrls: document.getElementById("lan-urls"),
  lanWarning: document.getElementById("lan-warning"),
});
const phases = window.PixelatedPhases.createPhaseTracker({
  phaseList: document.getElementById("phase-list"),
  phaseSummary: document.getElementById("phase-summary"),
});

window.PixelatedModal.bindDocsModal({
  closeButton: document.getElementById("close-docs"),
  modal: document.getElementById("docs-modal"),
  openButton: document.getElementById("open-docs"),
});

function setStatusBadge(active) {
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
  exposure.setEnabled(true);
  isRunning = false;
  powerBtn.disabled = false;
}

function setLifecycleState(state) {
  const detail = state.detail ? ` · ${state.detail}` : "";
  statusBadge.innerHTML = `<span class="inline-block w-2 h-2 rounded-full bg-synth-primary mr-1 animate-pulse shadow-glow-primary"></span> ${state.label}${detail}`;
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
    powerText.innerText = state.label;
  }

  if (state.status === "stopping") {
    powerBtn.disabled = true;
    exposure.setEnabled(false);
    powerText.innerText = "Shutting down...";
  }
}

powerBtn.addEventListener("click", () => {
  if (!isRunning) {
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
    window.electronAPI.startDocker({ exposureMode: exposure.getMode() });
    return;
  }

  powerBtn.disabled = true;
  powerText.innerText = "Shutting down...";
  window.electronAPI.stopDocker();
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

window.electronAPI.onEngineToken((event, token) => {
  tokenValue.innerText = token;
  tokenPanel.classList.remove("hidden");
});

window.electronAPI.onEngineExposure((event, payload) => {
  exposure.renderUrls(payload.advertisedUrls || []);
});

window.electronAPI.onEngineState((event, state) => {
  setLifecycleState(state);
});

window.electronAPI.onServerLog((event, message) => {
  logs.append(
    `<span class="text-synth-primary">SYS</span> ${logs.sanitize(message)}`,
  );
});

window.electronAPI.onEngineStopped(() => {
  powerBtn.disabled = false;
});

exposure.render();
phases.render();
