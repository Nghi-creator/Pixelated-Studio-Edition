(function () {
  type ExposureMode = "local" | "lan";

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

  type ClientAccessControllerElements = {
    clientsList: HTMLElement;
    clientsStatus: HTMLElement;
    getExposureMode: () => ExposureMode;
    getIsRunning: () => boolean;
    listEngineClients: () => Promise<{ clients: EngineClientPayload[] }>;
    revokeEngineClient: (clientId: string) => Promise<{ disconnected: number }>;
    rotateEngineToken: (options: { exposureMode?: ExposureMode }) => void;
    rotateTokenButton: HTMLButtonElement;
  };

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

  function createClientAccessController({
    clientsList,
    clientsStatus,
    getExposureMode,
    getIsRunning,
    listEngineClients,
    revokeEngineClient,
    rotateEngineToken,
    rotateTokenButton,
  }: ClientAccessControllerElements) {
    let actionPending = false;
    let pollTimer: number | null = null;

    function setControlsEnabled(enabled: boolean) {
      rotateTokenButton.disabled = !enabled || actionPending;
    }

    function renderClients(clients: EngineClientPayload[]) {
      clientsList.replaceChildren();

      if (!getIsRunning()) {
        clientsStatus.innerText =
          "Start the engine to see connected browser clients.";
        setControlsEnabled(false);
        return;
      }

      setControlsEnabled(true);

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
        title.innerText = `${formatClientScope(
          client.accessScope,
        )} · ${formatClientRole(client.role)}`;

        const revokeButton = document.createElement("button");
        revokeButton.className =
          "shrink-0 rounded-md border border-red-400/50 bg-red-500/10 px-2.5 py-1 text-[11px] font-bold text-red-200 transition-colors hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50";
        revokeButton.disabled = actionPending;
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
        details.className =
          "mt-2 break-all font-mono leading-5 text-synth-secondary";
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
      if (!getIsRunning() || actionPending) return;
      actionPending = true;
      setControlsEnabled(false);
      clientsStatus.innerText = "Revoking selected browser client...";

      try {
        await revokeEngineClient(clientId);
      } catch (err) {
        clientsStatus.innerText = `Could not revoke client: ${String(err)}`;
      } finally {
        actionPending = false;
        await refresh();
      }
    }

    async function refresh() {
      if (!getIsRunning()) {
        renderClients([]);
        return;
      }

      try {
        const { clients } = await listEngineClients();
        renderClients(clients);
      } catch (err) {
        clientsStatus.innerText = `Could not load connected clients: ${String(
          err,
        )}`;
        clientsList.replaceChildren();
        setControlsEnabled(true);
      }
    }

    function startPolling() {
      if (pollTimer !== null) return;
      void refresh();
      pollTimer = window.setInterval(() => {
        void refresh();
      }, 3_000);
    }

    function stopPolling() {
      if (pollTimer !== null) {
        window.clearInterval(pollTimer);
        pollTimer = null;
      }
      renderClients([]);
    }

    function resetActionPending() {
      actionPending = false;
      setControlsEnabled(getIsRunning());
    }

    rotateTokenButton.addEventListener("click", () => {
      if (!getIsRunning() || actionPending) return;
      actionPending = true;
      setControlsEnabled(false);
      clientsStatus.innerText = "Rotating token and restarting engine...";
      rotateEngineToken({
        exposureMode: getExposureMode(),
      });
    });

    return {
      refresh,
      resetActionPending,
      setControlsEnabled,
      startPolling,
      stopPolling,
    };
  }

  (window as unknown as Window & {
    PixelatedClients: {
      createClientAccessController: typeof createClientAccessController;
    };
  }).PixelatedClients = {
    createClientAccessController,
  };
})();
