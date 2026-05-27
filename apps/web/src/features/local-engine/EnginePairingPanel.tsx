import {
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  PlugZap,
  Trash2,
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

type EnginePairingPanelProps = {
  compact?: boolean;
  onPaired?: () => void;
};

const normalizeEngineUrl = (url: string) => url.trim().replace(/\/$/, "");

const engineUrlEndpoint = (url: string, path: string) => {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizeEngineUrl(url)}${normalizedPath}`;
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
    token ? "Local engine token is saved in this browser." : "",
  );

  useEffect(() => {
    const refreshPairingState = () => {
      const currentToken = getEngineToken();
      setToken(currentToken);
      setEngineUrlInput(getEngineUrl());
      setPairingState(currentToken ? "paired" : "idle");
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

    if (!normalizedUrl || !normalizedToken) {
      setPairingState("error");
      setMessage("Enter the local engine URL and desktop pairing token.");
      return;
    }

    setPairingState("checking");
    setMessage("Checking local engine...");

    try {
      const healthResponse = await fetch(
        engineUrlEndpoint(normalizedUrl, "/health"),
      );
      if (!healthResponse.ok) {
        throw new Error("Local engine health check failed.");
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
        setMessage("That token was rejected by the local engine.");
        return;
      }

      if (!authResponse.ok) {
        throw new Error("Local engine token check failed.");
      }

      setEngineUrl(normalizedUrl);
      setEngineToken(normalizedToken);

      try {
        await api.pairLocalEngine(normalizedUrl);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          setMessage(
            "Engine token saved locally. Sign in to register pairing intent with the API.",
          );
        } else {
          console.warn("Local engine paired, but API registration failed:", err);
          setMessage(
            "Engine token saved locally. Backend pairing registration is unavailable.",
          );
        }
      }

      setPairingState("paired");
      setMessage((currentMessage) => currentMessage || "Local engine paired.");
      onPaired?.();
    } catch (err) {
      console.error("Failed to pair local engine:", err);
      setPairingState("error");
      setMessage("Could not reach the local engine at that URL.");
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
                placeholder="http://localhost:8080"
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
