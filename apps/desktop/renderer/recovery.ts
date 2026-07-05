(function () {
  type ExposureMode = "local" | "lan";

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

  type RecoveryLogController = {
    append: (message: string) => void;
    sanitize: (message: string) => string;
  };

  type DockerRecoveryControllerElements = {
    buildImageButton: HTMLButtonElement;
    cancelDockerRecovery: () => void;
    copyDiagnosticsButton: HTMLButtonElement;
    desktopPanels: HTMLElement;
    downloadButton: HTMLButtonElement;
    getExposureMode: () => ExposureMode;
    guideButton: HTMLButtonElement;
    guidance: HTMLElement;
    initializeEngine: () => void;
    logs: RecoveryLogController;
    openDockerResource: (
      resource: "guide" | "install",
      diagnosticCode: string,
    ) => Promise<void>;
    panel: HTMLElement;
    retryButton: HTMLButtonElement;
    startButton: HTMLButtonElement;
    startDockerApplication: (options: { exposureMode?: ExposureMode }) => void;
    buildEngineImage: (options: { exposureMode?: ExposureMode }) => void;
    startupPanel: HTMLElement;
    syncPanelHeights: () => void;
    title: HTMLElement;
  };

  function createImageRecoveryActionState(pending: boolean) {
    return {
      buildDisabled: pending,
      buildHidden: false,
      buildText: pending ? "Building..." : "Build image & retry",
      downloadHidden: true,
      guideHidden: true,
      retryDisabled: pending,
      startDisabled: pending,
      startHidden: true,
    };
  }

  function createDockerRecoveryController({
    buildEngineImage,
    buildImageButton,
    cancelDockerRecovery,
    copyDiagnosticsButton,
    desktopPanels,
    downloadButton,
    getExposureMode,
    guideButton,
    guidance,
    initializeEngine,
    logs,
    openDockerResource,
    panel,
    retryButton,
    startButton,
    startDockerApplication,
    startupPanel,
    syncPanelHeights,
    title,
  }: DockerRecoveryControllerElements) {
    let dockerDiagnostic: DockerDiagnosticPayload | null = null;
    let imageRecovery: EngineImageRecoveryPayload | null = null;
    let dockerRecoveryPending = false;
    let imageBuildPending = false;

    function setDockerRecoveryPending(pending: boolean) {
      dockerRecoveryPending = pending;
      startButton.innerText = pending ? "Cancel waiting" : "Start Docker";
      retryButton.disabled = pending;
      buildImageButton.disabled = pending;
      downloadButton.disabled = pending;
      guideButton.disabled = pending;
    }

    function setImageBuildPending(pending: boolean) {
      imageBuildPending = pending;
      const state = createImageRecoveryActionState(pending);
      buildImageButton.innerText = state.buildText;
      retryButton.disabled = state.retryDisabled;
      startButton.disabled = state.startDisabled;
      buildImageButton.disabled = state.buildDisabled;
      downloadButton.disabled = pending;
      guideButton.disabled = pending;
    }

    function setDockerRecoveryVisible(
      visible: boolean,
      diagnostic: DockerDiagnosticPayload | null = null,
    ) {
      dockerDiagnostic = visible ? diagnostic : null;
      imageRecovery = null;
      panel.classList.toggle("hidden", !visible);
      startupPanel.classList.toggle("recovery-active", visible);
      if (!visible) {
        desktopPanels.style.removeProperty("--startup-recovery-height");
      }
      requestAnimationFrame(syncPanelHeights);
      if (!visible || !diagnostic) return;

      title.innerText = diagnostic.title;
      guidance.innerText = diagnostic.guidance;
      buildImageButton.classList.add("hidden");
      downloadButton.classList.toggle(
        "hidden",
        diagnostic.code !== "cli_missing",
      );
      guideButton.classList.remove("hidden");
      startButton.classList.toggle("hidden", !diagnostic.canStartDocker);
      copyDiagnosticsButton.classList.remove("hidden");
      setDockerRecoveryPending(false);
    }

    function setImageRecoveryVisible(
      visible: boolean,
      payload: EngineImageRecoveryPayload | null = null,
    ) {
      imageRecovery = visible ? payload : null;
      dockerDiagnostic = null;
      panel.classList.toggle("hidden", !visible);
      startupPanel.classList.toggle("recovery-active", visible);
      if (!visible) {
        desktopPanels.style.removeProperty("--startup-recovery-height");
      }
      requestAnimationFrame(syncPanelHeights);
      if (!visible || !payload) return;

      title.innerText = payload.title;
      guidance.innerText = payload.guidance;
      const actionState = createImageRecoveryActionState(false);
      buildImageButton.classList.toggle("hidden", actionState.buildHidden);
      downloadButton.classList.toggle("hidden", actionState.downloadHidden);
      guideButton.classList.toggle("hidden", actionState.guideHidden);
      startButton.classList.toggle("hidden", actionState.startHidden);
      copyDiagnosticsButton.classList.remove("hidden");
      setImageBuildPending(false);
    }

    async function openResource(resource: "guide" | "install") {
      if (!dockerDiagnostic) return;

      retryButton.disabled = true;
      buildImageButton.disabled = true;
      downloadButton.disabled = true;
      guideButton.disabled = true;
      try {
        await openDockerResource(resource, dockerDiagnostic.code);
      } catch (err) {
        logs.append(
          `<span class="text-red-400">Could not open Docker guidance: ${logs.sanitize(
            String(err),
          )}</span>`,
        );
      } finally {
        if (!dockerRecoveryPending) {
          retryButton.disabled = false;
          buildImageButton.disabled = false;
          downloadButton.disabled = false;
          guideButton.disabled = false;
        }
      }
    }

    retryButton.addEventListener("click", initializeEngine);

    startButton.addEventListener("click", () => {
      if (dockerRecoveryPending) {
        cancelDockerRecovery();
        return;
      }

      setDockerRecoveryPending(true);
      startDockerApplication({
        exposureMode: getExposureMode(),
      });
    });

    buildImageButton.addEventListener("click", () => {
      if (imageBuildPending) return;

      setImageBuildPending(true);
      buildEngineImage({
        exposureMode: getExposureMode(),
      });
    });

    downloadButton.addEventListener("click", () => {
      void openResource("install");
    });

    guideButton.addEventListener("click", () => {
      void openResource("guide");
    });

    copyDiagnosticsButton.addEventListener("click", async () => {
      const summary = dockerDiagnostic?.summary || imageRecovery?.summary;
      if (!summary) return;

      try {
        await navigator.clipboard.writeText(summary);
        copyDiagnosticsButton.innerText = "Copied";
        setTimeout(() => {
          copyDiagnosticsButton.innerText = "Copy diagnostics";
        }, 1200);
      } catch {
        logs.append(
          '<span class="text-red-400">Failed to copy the sanitized diagnostic.</span>',
        );
      }
    });

    return {
      setDockerRecoveryPending,
      setDockerRecoveryVisible,
      setImageBuildPending,
      setImageRecoveryVisible,
    };
  }

  (window as unknown as Window & {
    PixelatedRecovery: {
      createDockerRecoveryController: typeof createDockerRecoveryController;
    };
  }).PixelatedRecovery = {
    createDockerRecoveryController,
  };
})();
