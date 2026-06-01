import {
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  PlugZap,
  Trash2,
  Wifi,
} from "lucide-react";
import { useEffect, useState } from "react";
import { api, ApiError } from "../../lib/apiClient";
import {
  clearEngineToken,
  ENGINE_PAIRING_EVENT,
  getEngineToken,
  setEngineToken,
} from "../../lib/engineAuth";
import {
  clearEngineUrl,
  DEFAULT_ENGINE_URL,
  getEngineUrl,
  setEngineUrl,
} from "../../lib/engineConfig";

type PairingState = "idle" | "checking" | "paired" | "error";
type EngineUrlScope = "local" | "lan" | "custom";

type EngineHealthPayload = {
  advertisedUrls?: string[];
  engineTokenRequired?: boolean;
  exposureMode?: "local" | "lan";
  ok?: boolean;
};

type PairingFailureContext = {
  error: unknown;
  parsedUrl: URL;
  scope: EngineUrlScope;
  status?: number;
};

type EnginePairingPanelProps = {
  compact?: boolean;
  onPaired?: () => void;
};

const normalizeEngineUrl = (url: string) => url.trim().replace(/\/+$/, "");

const engineUrlEndpoint = (url: string, path: string) => {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizeEngineUrl(url)}${normalizedPath}`;
};

const parseEngineUrl = (url: string) => {
  try {
    const parsed = new URL(normalizeEngineUrl(url));
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    return parsed;
  } catch {
    return null;
  }
};

const isPrivateIpv4 = (hostname: string) => {
  const parts = hostname.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) {
    return false;
  }

  const [first, second] = parts;
  return (
    first === 10 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 169 && second === 254)
  );
};

const getEngineUrlScope = (url: string): EngineUrlScope => {
  const parsed = parseEngineUrl(url);
  if (!parsed) return "custom";

  const hostname = parsed.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]"
  ) {
    return "local";
  }

  if (isPrivateIpv4(hostname) || hostname.endsWith(".local")) {
    return "lan";
  }

  return "custom";
};

const getScopeLabel = (scope: EngineUrlScope) => {
  if (scope === "lan") return "LAN engine";
  if (scope === "custom") return "Custom engine";
  return "Local engine";
};

const getScopeDescription = (scope: EngineUrlScope) => {
  if (scope === "lan") {
    return "Connects to an engine exposed on your local network. Use only with a token from someone you trust.";
  }

  if (scope === "custom") {
    return "Connects to a custom engine URL. Make sure you trust the host before pairing.";
  }

  return "Connects to an engine running on this computer.";
};

const isLikelyCompanionUrl = (url: URL) =>
  url.protocol === "https:" && url.port === "8090";

const getPairingFailureMessage = ({
  error,
  parsedUrl,
  scope,
  status,
}: PairingFailureContext) => {
  if (status === 401) {
    return "That token was rejected by the engine. Copy the current token from the desktop app and try again.";
  }

  if (status === 502 && isLikelyCompanionUrl(parsedUrl)) {
    return "The HTTPS join page is reachable, but it cannot reach the local engine. Keep the host desktop app open, confirm the engine is initialized, then try again.";
  }

  if (status && status >= 500) {
    return "The engine responded with an internal error. Restart the desktop engine and try pairing again.";
  }

  if (
    scope === "lan" &&
    window.location.protocol === "https:" &&
    parsedUrl.protocol === "http:"
  ) {
    return "The hosted HTTPS app may be blocked from reaching an HTTP LAN engine. Use the HTTPS companion join page from the desktop app instead.";
  }

  if (scope === "lan" && parsedUrl.protocol === "https:") {
    return "Could not reach the HTTPS LAN join page. If the browser shows a privacy or certificate warning, open the join URL directly, accept the local certificate for this test, then retry pairing.";
  }

  if (scope === "lan") {
    return "Could not reach that LAN engine. Confirm LAN mode is enabled, the host desktop app is running, and both devices are on the same network.";
  }

  if (error instanceof TypeError) {
    return "Could not reach the local engine. Make sure the desktop app is running and the URL points to this computer.";
  }

  return "Could not reach the local engine at that URL.";
};

export function EnginePairingPanel({
  compact = false,
  onPaired,
}: EnginePairingPanelProps) {
  const [engineUrl, setEngineUrlInput] = useState(getEngineUrl);
  const [token, setToken] = useState(getEngineToken);
  const [pairingState, setPairingState] = useState<PairingState>(
    token ? "paired" : "idle",
  );
  const [showToken, setShowToken] = useState(false);
  const [message, setMessage] = useState(
    token
      ? `${getScopeLabel(getEngineUrlScope(getEngineUrl()))} token is saved in this browser.`
      : "",
  );
  const engineUrlScope = getEngineUrlScope(engineUrl);

  useEffect(() => {
    const refreshPairingState = () => {
      const currentToken = getEngineToken();
      setToken(currentToken);
      setEngineUrlInput(getEngineUrl());
      setPairingState(currentToken ? "paired" : "idle");
      setMessage(
        currentToken
          ? `${getScopeLabel(getEngineUrlScope(getEngineUrl()))} token is saved in this browser.`
          : "",
      );
    };

    window.addEventListener(ENGINE_PAIRING_EVENT, refreshPairingState);
    return () =>
      window.removeEventListener(ENGINE_PAIRING_EVENT, refreshPairingState);
  }, []);

  useEffect(() => {
    api
      .localPairing()
      .then(({ pairing }) => {
        setEngineUrlInput(pairing.engineUrl);
      })
      .catch((err) => {
        if (!(err instanceof ApiError && [401, 404, 503].includes(err.status))) {
          console.warn("Failed to load backend local pairing:", err);
        }
      });
  }, []);

  const pairEngine = async () => {
    const normalizedUrl = normalizeEngineUrl(engineUrl);
    const normalizedToken = token.trim();
    const parsedUrl = parseEngineUrl(normalizedUrl);

    if (!normalizedUrl || !normalizedToken) {
      setPairingState("error");
      setMessage("Enter the engine URL and desktop pairing token.");
      return;
    }

    if (!parsedUrl) {
      setPairingState("error");
      setMessage("Enter a valid engine URL, including http:// or https://.");
      return;
    }

    setPairingState("checking");
    setMessage(
      `Checking ${getScopeLabel(getEngineUrlScope(normalizedUrl)).toLowerCase()}...`,
    );

    try {
      const healthResponse = await fetch(
        engineUrlEndpoint(normalizedUrl, "/health"),
      );
      if (!healthResponse.ok) {
        setPairingState("error");
        setMessage(
          getPairingFailureMessage({
            error: new Error("Engine health check failed."),
            parsedUrl,
            scope: getEngineUrlScope(normalizedUrl),
            status: healthResponse.status,
          }),
        );
        return;
      }
      const health = (await healthResponse.json()) as EngineHealthPayload;
      const reportedExposureMode = health.exposureMode || "local";
      const actualScope = getEngineUrlScope(normalizedUrl);

      if (actualScope === "lan" && reportedExposureMode !== "lan") {
        setPairingState("error");
        setMessage(
          "That URL looks like a LAN address, but the engine reports local-only mode. Enable LAN mode in the desktop app and restart the engine.",
        );
        return;
      }

      const authResponse = await fetch(
        engineUrlEndpoint(normalizedUrl, "/local-games"),
        {
          headers: {
            "X-Engine-Token": normalizedToken,
            "X-User-Id": "pairing-check",
          },
        },
      );

      if (authResponse.status === 401) {
        setPairingState("error");
        setMessage(
          getPairingFailureMessage({
            error: new Error("Engine token check failed."),
            parsedUrl,
            scope: actualScope,
            status: authResponse.status,
          }),
        );
        return;
      }

      if (!authResponse.ok) {
        setPairingState("error");
        setMessage(
          getPairingFailureMessage({
            error: new Error("Engine token check failed."),
            parsedUrl,
            scope: actualScope,
            status: authResponse.status,
          }),
        );
        return;
      }

      setEngineUrl(normalizedUrl);
      setEngineToken(normalizedToken);

      let successMessage =
        actualScope === "lan"
          ? "LAN engine paired. Keep the desktop app running while guests connect."
          : "Local engine paired.";

      try {
        await api.pairLocalEngine(normalizedUrl);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          successMessage =
            "Engine token saved locally. Sign in to register pairing intent with the API.";
        } else {
          console.warn("Local engine paired, but API registration failed:", err);
          successMessage =
            "Engine token saved locally. Backend pairing registration is unavailable.";
        }
      }

      setPairingState("paired");
      setMessage(successMessage);
      onPaired?.();
    } catch (err) {
      console.error("Failed to pair local engine:", err);
      setPairingState("error");
      setMessage(
        getPairingFailureMessage({
          error: err,
          parsedUrl,
          scope: getEngineUrlScope(normalizedUrl),
        }),
      );
    }
  };

  const disconnect = async () => {
    clearEngineToken();
    clearEngineUrl();
    setToken("");
    setEngineUrlInput(DEFAULT_ENGINE_URL);
    setPairingState("idle");
    setMessage("");

    try {
      await api.clearLocalPairing();
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 401)) {
        console.warn("Failed to clear backend local pairing:", err);
      }
    }
  };

  return (
    <section
      className={`w-full border border-synth-border bg-synth-surface ${
        compact ? "rounded-lg p-4" : "rounded-xl p-5"
      }`}
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-end">
        <div className="min-w-0 flex-1">
          <div className="mb-3 flex items-center gap-2">
            {pairingState === "paired" ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            ) : engineUrlScope === "lan" ? (
              <Wifi className="h-5 w-5 text-synth-secondary" />
            ) : (
              <PlugZap className="h-5 w-5 text-synth-primary" />
            )}
            <h3 className="text-base font-semibold text-white">
              Local Engine Pairing
            </h3>
          </div>

          <div className="grid gap-3 md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                Engine URL
              </span>
              <input
                value={engineUrl}
                onChange={(event) => setEngineUrlInput(event.target.value)}
                className="h-11 w-full rounded-lg border border-synth-border bg-synth-bg px-3 text-sm text-white outline-none transition-colors placeholder:text-gray-600 focus:border-synth-primary"
                placeholder="http://localhost:8080 or http://192.168.1.20:8080"
              />
            </label>

            <label className="relative block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                Pairing token
              </span>
              <input
                value={token}
                onChange={(event) => setToken(event.target.value)}
                className="h-11 w-full rounded-lg border border-synth-border bg-synth-bg px-3 pr-11 text-sm text-white outline-none transition-colors placeholder:text-gray-600 focus:border-synth-primary"
                placeholder="Desktop app token"
                type={showToken ? "text" : "password"}
              />
              <button
                aria-label={
                  showToken ? "Hide pairing token" : "Show pairing token"
                }
                className="absolute right-2 top-7 inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 transition-colors hover:text-white"
                onClick={() => setShowToken((isVisible) => !isVisible)}
                title={showToken ? "Hide token" : "Show token"}
                type="button"
              >
                {showToken ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </label>
          </div>

          <div
            className={`mt-3 rounded-lg border px-3 py-2 text-xs leading-5 ${
              engineUrlScope === "lan"
                ? "border-amber-400/30 bg-amber-400/10 text-amber-200"
                : "border-synth-border bg-synth-bg text-gray-400"
            }`}
          >
            <span className="font-semibold text-white">
              {getScopeLabel(engineUrlScope)}:
            </span>{" "}
            {getScopeDescription(engineUrlScope)}
          </div>

          {message && (
            <p
              className={`mt-3 text-sm ${
                pairingState === "error" ? "text-red-300" : "text-gray-400"
              }`}
            >
              {message}
            </p>
          )}
        </div>

        <div className="flex shrink-0 gap-2">
          <button
            onClick={pairEngine}
            disabled={pairingState === "checking"}
            className="inline-flex h-11 items-center gap-2 rounded-lg border border-synth-primary/70 bg-synth-primary/15 px-4 text-sm font-semibold text-white transition-colors hover:bg-synth-primary/25 disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
          >
            {pairingState === "checking" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <PlugZap className="h-4 w-4" />
            )}
            {pairingState === "paired" ? "Update" : "Pair"}
          </button>

          {pairingState === "paired" && (
            <button
              onClick={disconnect}
              className="inline-flex h-11 items-center gap-2 rounded-lg border border-synth-border bg-synth-bg px-3 text-sm font-semibold text-gray-300 transition-colors hover:border-red-400/70 hover:text-red-300"
              type="button"
            >
              <Trash2 className="h-4 w-4" />
              Clear
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
