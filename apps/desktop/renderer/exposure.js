(function () {
  function createExposureController({
    exposureCopy,
    exposureLabel,
    companionCopy,
    companionPanel,
    companionUrls,
    lanToggle,
    lanUrlPanel,
    lanUrls,
    lanWarning,
  }) {
    function getMode() {
      return lanToggle.checked ? "lan" : "local";
    }

    function renderUrls(urls = []) {
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

    function renderCompanionUrls(urls = []) {
      companionUrls.innerHTML = "";
      urls.forEach((url) => {
        const item = document.createElement("code");
        item.className = "block break-all";
        item.innerText = url;
        companionUrls.appendChild(item);
      });
      companionPanel.classList.toggle(
        "hidden",
        getMode() !== "lan" || urls.length === 0,
      );
    }

    function setCompanionStatus(payload = {}) {
      if (!payload.enabled) {
        companionPanel.classList.add("hidden");
        if (payload.error) {
          companionCopy.innerText = payload.error;
        }
        return;
      }

      renderCompanionUrls(payload.urls || []);
      companionCopy.innerText =
        "Guests may need to trust the local certificate the first time they open this page.";
    }

    function render() {
      const isLan = getMode() === "lan";

      exposureLabel.innerText = isLan ? "LAN multiplayer" : "Local only";
      exposureCopy.innerText = isLan
        ? "Engine will bind to your LAN when initialized."
        : "Engine binds to this computer only.";
      lanWarning.classList.toggle("hidden", !isLan);
      lanUrlPanel.classList.toggle("hidden", !isLan || !lanUrls.innerText);
      companionPanel.classList.toggle(
        "hidden",
        !isLan || !companionUrls.innerText,
      );
    }

    function setEnabled(enabled) {
      lanToggle.disabled = !enabled;
      lanToggle.parentElement.classList.toggle("opacity-50", !enabled);
      lanToggle.parentElement.classList.toggle("cursor-not-allowed", !enabled);
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
      setEnabled,
      setCompanionStatus,
    };
  }

  window.PixelatedExposure = {
    createExposureController,
  };
})();
