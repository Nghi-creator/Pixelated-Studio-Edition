(function () {
  type LifecycleControllerElements = {
    clients: ClientAccessController;
    electronApi: ElectronApi;
    exposure: ExposureController;
    getCompactLifecycleStatus: (state: EngineStatePayload) => string;
    launchWebButton: HTMLButtonElement;
    logs: LogController;
    phases: PhaseTracker;
    powerButton: HTMLButtonElement;
    powerIcon: HTMLElement;
    powerSpinner: HTMLElement;
    powerText: HTMLElement;
    recovery: DockerRecoveryController;
    regenerateInviteButton: HTMLButtonElement;
    revokeInviteButton: HTMLButtonElement;
    setStatusPresentation: (text: string, tone: StatusTone) => void;
    tokenPanel: HTMLElement;
    tokenValue: HTMLElement;
  };

  function createLifecycleController({
    clients,
    electronApi,
    exposure,
    getCompactLifecycleStatus,
    launchWebButton,
    logs,
    phases,
    powerButton,
    powerIcon,
    powerSpinner,
    powerText,
    recovery,
    regenerateInviteButton,
    revokeInviteButton,
    setStatusPresentation,
    tokenPanel,
    tokenValue,
  }: LifecycleControllerElements): DesktopLifecycleController {
    let isRunning = false;
    let pendingCompanionPayload: EngineCompanionPayload | null = null;

    function setPowerPending(pending: boolean) {
      powerIcon.classList.toggle("hidden", pending);
      powerSpinner.classList.toggle("hidden", !pending);
      powerButton.disabled = pending;
    }

    function setLaunchWebVisible(visible: boolean) {
      launchWebButton.classList.toggle("hidden", !visible);
      launchWebButton.classList.toggle("flex", visible);
    }

    function setInviteButtonsPending(pending: boolean) {
      regenerateInviteButton.disabled = pending;
      revokeInviteButton.disabled = pending;
      if (pending) {
        regenerateInviteButton.innerText = "Updating...";
        return;
      }
      regenerateInviteButton.innerText = "Regenerate";
      revokeInviteButton.innerText = "Revoke";
    }

    function resetSharedUi() {
      powerButton.classList.replace("bg-synth-action", "bg-synth-primary");
      powerButton.classList.replace(
        "hover:bg-synth-action-hover",
        "hover:bg-synth-primary-hover",
      );
      powerButton.classList.add("shadow-panel");
      powerText.innerText = "Initialize Engine";
      setPowerPending(false);
      setLaunchWebVisible(false);
      tokenPanel.classList.add("hidden");
      tokenValue.innerText = "";
      exposure.renderUrls([]);
      exposure.renderCompanionUrls([]);
      exposure.resetInviteCode();
      pendingCompanionPayload = null;
      regenerateInviteButton.disabled = true;
      revokeInviteButton.disabled = true;
      exposure.setEnabled(true);
      isRunning = false;
      clients.stopPolling();
    }

    function setReady() {
      setStatusPresentation("Engine Ready", "ready");
      powerButton.classList.replace("bg-synth-primary", "bg-synth-action");
      powerButton.classList.replace(
        "hover:bg-synth-primary-hover",
        "hover:bg-synth-action-hover",
      );
      powerButton.classList.remove("shadow-panel");
      powerText.innerText = "Shutdown Engine";
      setPowerPending(false);
      setLaunchWebVisible(true);
      isRunning = true;
      clients.startPolling();
      if (pendingCompanionPayload) {
        exposure.setCompanionStatus(pendingCompanionPayload);
        setInviteButtonsPending(false);
        regenerateInviteButton.disabled = !pendingCompanionPayload.enabled;
        revokeInviteButton.disabled =
          !pendingCompanionPayload.enabled ||
          Boolean(pendingCompanionPayload.inviteRevoked);
        pendingCompanionPayload = null;
      }
    }

    function setOffline() {
      setStatusPresentation("Engine Offline", "offline");
      resetSharedUi();
      phases.render({ status: "stopped", phase: "idle" });
    }

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
      phases.render({ detail: "Queued", phase: "docker", status: "starting" });
      setStatusPresentation("Initializing Engine - Queued", "running");
      setPowerPending(true);
      powerText.innerText = "Initialize Engine";
      electronApi.startDocker({ exposureMode: exposure.getMode() });
    }

    function setLifecycleState(state: EngineStatePayload) {
      const statusLabel = getCompactLifecycleStatus(state);
      phases.render(state);

      if (state.status === "ready") {
        recovery.setDockerRecoveryVisible(false);
        setReady();
        powerButton.disabled = false;
        exposure.setEnabled(false);
        return;
      }
      if (state.status === "failed") {
        setStatusPresentation(statusLabel, "offline");
        resetSharedUi();
        return;
      }
      if (state.status === "stopped") {
        setOffline();
        powerButton.disabled = false;
        return;
      }
      if (state.status === "starting" || state.status === "stopping") {
        setLaunchWebVisible(false);
        setStatusPresentation(statusLabel, "running");
        setPowerPending(true);
        exposure.setEnabled(false);
        powerText.innerText =
          state.status === "stopping" ? "Shutdown Engine" : "Initialize Engine";
      }
    }

    function handleEngineCompanion(payload: EngineCompanionPayload) {
      if (!isRunning) {
        pendingCompanionPayload = payload;
        return;
      }
      exposure.setCompanionStatus(payload);
      setInviteButtonsPending(false);
      regenerateInviteButton.disabled = !payload.enabled;
      revokeInviteButton.disabled =
        !payload.enabled || Boolean(payload.inviteRevoked);
    }

    return {
      getIsRunning: () => isRunning,
      handleEngineCompanion,
      initializeEngine,
      setLifecycleState,
      setPowerPending,
    };
  }

  (window as unknown as Window & {
    PixelatedLifecycle: {
      createLifecycleController: typeof createLifecycleController;
    };
  }).PixelatedLifecycle = { createLifecycleController };
})();
