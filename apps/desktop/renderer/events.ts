(function () {
  type RendererEventBindings = {
    clearLogsButton: HTMLButtonElement;
    clients: ClientAccessController;
    companionCopyButton: HTMLButtonElement;
    electronApi: ElectronApi;
    exposure: ExposureController;
    getIsRunning: () => boolean;
    handleEngineCompanion: (payload: EngineCompanionPayload) => void;
    initializeEngine: () => void;
    launchWebButton: HTMLButtonElement;
    logs: LogController;
    powerButton: HTMLButtonElement;
    powerText: HTMLElement;
    recovery: DockerRecoveryController;
    regenerateInviteButton: HTMLButtonElement;
    revokeInviteButton: HTMLButtonElement;
    setLifecycleState: (state: EngineStatePayload) => void;
    setPowerPending: (pending: boolean) => void;
    setStatusPresentation: (text: string, tone: StatusTone) => void;
    tokenPanel: HTMLElement;
    tokenCopyButton: HTMLButtonElement;
    tokenValue: HTMLElement;
  };

  function resetButtonLabel(
    button: HTMLButtonElement,
    label: string,
    delayMs = 1_200,
  ) {
    window.setTimeout(() => {
      button.innerText = label;
    }, delayMs);
  }

  function bindRendererEvents({
    clearLogsButton,
    clients,
    companionCopyButton,
    electronApi,
    exposure,
    getIsRunning,
    handleEngineCompanion,
    initializeEngine,
    launchWebButton,
    logs,
    powerButton,
    powerText,
    recovery,
    regenerateInviteButton,
    revokeInviteButton,
    setLifecycleState,
    setPowerPending,
    setStatusPresentation,
    tokenPanel,
    tokenCopyButton,
    tokenValue,
  }: RendererEventBindings) {
    powerButton.addEventListener("click", () => {
      if (!getIsRunning()) {
        initializeEngine();
        return;
      }

      setStatusPresentation("Stopping Engine", "running");
      setPowerPending(true);
      powerText.innerText = "Shutdown Engine";
      electronApi.stopDocker();
    });

    launchWebButton.addEventListener("click", async () => {
      launchWebButton.disabled = true;
      try {
        await electronApi.launchWeb();
      } catch (err) {
        logs.append(
          `<span class="text-red-400">Could not launch the web app: ${logs.sanitize(String(err))}</span>`,
        );
      } finally {
        launchWebButton.disabled = false;
      }
    });

    clearLogsButton.addEventListener("click", () => logs.clear());

    const bindCopyButton = (
      button: HTMLButtonElement,
      getValue: () => string,
      failureMessage: string,
    ) => {
      button.addEventListener("click", async () => {
        const value = getValue();
        if (!value) return;
        try {
          await navigator.clipboard.writeText(value);
          button.innerText = "Copied";
          resetButtonLabel(button, "Copy");
        } catch {
          logs.append(`<span class="text-red-400">${failureMessage}</span>`);
        }
      });
    };

    bindCopyButton(
      companionCopyButton,
      () =>
        document.querySelector<HTMLElement>("#companion-urls code")
          ?.innerText || "",
      "Failed to copy HTTPS join page. Select it manually.",
    );
    bindCopyButton(
      tokenCopyButton,
      () => tokenValue.innerText,
      "Failed to copy token. Select it manually.",
    );

    regenerateInviteButton.addEventListener("click", () => {
      regenerateInviteButton.disabled = true;
      revokeInviteButton.disabled = true;
      regenerateInviteButton.innerText = "Updating...";
      electronApi.regenerateLanInvite();
    });
    revokeInviteButton.addEventListener("click", () => {
      regenerateInviteButton.disabled = true;
      revokeInviteButton.disabled = true;
      regenerateInviteButton.innerText = "Updating...";
      electronApi.revokeLanInvite();
    });

    electronApi.onEngineToken((_event, token) => {
      tokenValue.innerText = token;
      tokenPanel.classList.remove("hidden");
    });
    electronApi.onEngineExposure((_event, payload) => {
      exposure.renderUrls(payload.advertisedUrls || []);
      exposure.renderCompanionUrls(payload.companionUrls || []);
    });
    electronApi.onEngineCompanion((_event, payload) => {
      handleEngineCompanion(payload);
    });
    electronApi.onDockerDiagnostic((_event, payload) => {
      recovery.setDockerRecoveryVisible(true, payload);
      logs.append(
        `<span class="text-red-400">${logs.sanitize(payload.title)}</span>`,
      );
      logs.append(
        `<span class="text-gray-400">Platform: ${logs.sanitize(payload.platform)} | Diagnostic: ${logs.sanitize(payload.code)}</span>`,
      );
    });
    electronApi.onEngineImageRecovery((_event, payload) => {
      recovery.setImageRecoveryVisible(true, payload);
      logs.append(
        `<span class="text-red-400">${logs.sanitize(payload.title)}</span>`,
      );
      logs.append(
        `<span class="text-gray-400">Image: ${logs.sanitize(payload.engineImage)} | Runtime: ${logs.sanitize(payload.runtimeKind)}</span>`,
      );
    });
    electronApi.onDockerRecoveryStarted(() => {
      recovery.setDockerRecoveryPending(true);
    });
    electronApi.onDockerRecoveryReady(() => {
      recovery.setDockerRecoveryVisible(false);
    });
    electronApi.onDockerRecoveryCancelled(() => {
      recovery.setDockerRecoveryPending(false);
    });
    electronApi.onEngineImageBuildStarted(() => {
      recovery.setImageBuildPending(true);
    });
    electronApi.onEngineImageBuildReady(() => {
      recovery.setImageRecoveryVisible(false);
    });
    electronApi.onEngineState((_event, state) => {
      if (
        state.status === "ready" ||
        state.status === "failed" ||
        state.status === "stopped"
      ) {
        clients.resetActionPending();
      }
      setLifecycleState(state);
    });
    electronApi.onServerLog((_event, message) => {
      logs.append(
        `<span class="text-synth-primary">SYS</span> ${logs.sanitize(message)}`,
      );
    });
    electronApi.onEngineStopped(() => {
      powerButton.disabled = false;
    });
  }

  (window as unknown as Window & {
    PixelatedEvents: {
      bindRendererEvents: typeof bindRendererEvents;
    };
  }).PixelatedEvents = {
    bindRendererEvents,
  };
})();
