(function () {
  type ExposureMode = "local" | "lan";

  type CompanionStatus = {
    enabled?: boolean;
    error?: string;
    inviteCode?: string;
    inviteExpiresAt?: string;
    inviteRevoked?: boolean;
    inviteStatus?: string;
    urls?: string[];
  };

  type ExposureControllerElements = {
    exposureCopy: HTMLElement;
    exposureLabel: HTMLElement;
    companionCopy: HTMLElement;
    companionInviteActions: HTMLElement;
    companionInvite: HTMLElement;
    companionInviteCode: HTMLElement;
    companionInviteExpiry: HTMLElement;
    companionInviteStatus: HTMLElement;
    companionPanel: HTMLElement;
    companionQr: HTMLElement;
    companionQrImage: HTMLImageElement;
    companionQrStatus: HTMLElement;
    companionUrls: HTMLElement;
    createCompanionQrDataUrl: (url: string) => Promise<string>;
    lanToggle: HTMLInputElement;
    lanUrlPanel: HTMLElement;
    lanUrls: HTMLElement;
    lanWarning: HTMLElement;
  };

  function createExposureController({
    exposureCopy,
    exposureLabel,
    companionCopy,
    companionInviteActions,
    companionInvite,
    companionInviteCode,
    companionInviteExpiry,
    companionInviteStatus,
    companionPanel,
    companionQr,
    companionQrImage,
    companionQrStatus,
    companionUrls,
    createCompanionQrDataUrl,
    lanToggle,
    lanUrlPanel,
    lanUrls,
    lanWarning,
  }: ExposureControllerElements) {
    let qrRenderId = 0;

    function getMode(): ExposureMode {
      return lanToggle.checked ? "lan" : "local";
    }

    function renderUrls(urls: string[] = []) {
      lanUrls.innerHTML = "";
      urls.forEach((url) => {
        const item = document.createElement("code");
        item.className = "block break-all";
        item.innerText = url;
        lanUrls.appendChild(item);
      });
      lanUrlPanel.classList.toggle(
        "hidden",
        getMode() !== "lan" || urls.length === 0,
      );
    }

    async function renderCompanionQr(url?: string) {
      const renderId = ++qrRenderId;
      companionQr.classList.add("hidden");
      companionQrImage.removeAttribute("src");

      if (!url) {
        companionQrStatus.innerText = "";
        companionQrStatus.classList.add("hidden");
        return;
      }

      companionQrStatus.innerText = "Preparing scan-to-join QR code...";
      companionQrStatus.classList.remove("hidden");

      try {
        const dataUrl = await createCompanionQrDataUrl(url);
        if (renderId !== qrRenderId) return;
        companionQrImage.src = dataUrl;
        companionQr.classList.remove("hidden");
        companionQrStatus.classList.add("hidden");
      } catch (err) {
        if (renderId !== qrRenderId) return;
        companionQrStatus.innerText =
          "QR code unavailable. Copy the HTTPS join page instead.";
      }
    }

    function renderCompanionUrls(urls: string[] = []) {
      companionUrls.innerHTML = "";
      urls.forEach((url) => {
        const item = document.createElement("code");
        item.className = "block break-all";
        item.innerText = url;
        companionUrls.appendChild(item);
      });
      void renderCompanionQr(urls[0]);
      companionPanel.classList.toggle(
        "hidden",
        getMode() !== "lan" || urls.length === 0,
      );
    }

    function renderInviteCode(payload: CompanionStatus = {}) {
      companionInviteCode.innerText = payload.inviteCode || "";
      companionInviteExpiry.innerText = payload.inviteExpiresAt
        ? `Expires ${new Date(payload.inviteExpiresAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}`
        : "";
      companionInviteStatus.innerText =
        payload.inviteStatus ||
        (payload.inviteRevoked
          ? "Invite code revoked. Regenerate a code before inviting more guests."
          : "Invite code active.");
      companionInvite.classList.toggle(
        "hidden",
        !payload.inviteCode && !payload.inviteRevoked,
      );
      companionInviteActions.classList.toggle("hidden", !payload.enabled);
    }

    function resetInviteCode() {
      companionInviteCode.innerText = "";
      companionInviteExpiry.innerText = "";
      companionInviteStatus.innerText = "";
      companionInvite.classList.add("hidden");
      companionInviteActions.classList.add("hidden");
    }

    function setCompanionStatus(payload: CompanionStatus = {}) {
      if (!payload.enabled) {
        companionPanel.classList.add("hidden");
        resetInviteCode();
        if (payload.error) {
          companionCopy.innerText = payload.error;
        }
        return;
      }

      renderCompanionUrls(payload.urls || []);
      renderInviteCode(payload);
      companionCopy.innerText =
        "Guests may need to trust the local certificate the first time they open this page. The invite code is short-lived and the engine token stays on this host.";
    }

    function render() {
      const isLan = getMode() === "lan";

      exposureLabel.innerText = isLan ? "LAN multiplayer" : "Local only";
      exposureCopy.innerText = isLan
        ? "Engine will start a LAN HTTPS join page when initialized."
        : "Engine binds to this computer only.";
      lanWarning.classList.toggle("hidden", !isLan);
      lanUrlPanel.classList.toggle("hidden", !isLan || !lanUrls.innerText);
      companionPanel.classList.toggle(
        "hidden",
        !isLan || !companionUrls.innerText,
      );
    }

    function setEnabled(enabled: boolean) {
      lanToggle.disabled = !enabled;
      lanToggle.parentElement?.classList.toggle("opacity-50", !enabled);
      lanToggle.parentElement?.classList.toggle("cursor-not-allowed", !enabled);
    }

    lanToggle.addEventListener("change", () => {
      renderUrls([]);
      render();
    });

    return {
      getMode,
      render,
      renderCompanionUrls,
      renderUrls,
      resetInviteCode,
      setEnabled,
      setCompanionStatus,
    };
  }

  (window as unknown as Window & {
    PixelatedExposure: {
      createExposureController: typeof createExposureController;
    };
  }).PixelatedExposure = {
    createExposureController,
  };
})();
