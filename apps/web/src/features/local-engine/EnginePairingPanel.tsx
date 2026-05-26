import { CheckCircle2, Loader2, PlugZap, Unplug } from "lucide-react";
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
  engineEndpoint,
  getEngineUrl,
  setEngineUrl,
} from "../../lib/engineConfig";

type PairingState = "idle" | "checking" | "paired" | "error";

type EnginePairingPanelProps = {
  compact?: boolean;
  onPaired?: () => void;
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

  const pairEngine = async () => {
    const normalizedUrl = engineUrl.trim().replace(/\/$/, "");
    const normalizedToken = token.trim();

    if (!normalizedUrl || !normalizedToken) {
      setPairingState("error");
      setMessage("Enter the local engine URL and desktop pairing token.");
      return;
    }

    setPairingState("checking");
    setMessage("Checking local engine...");

    try {
      setEngineUrl(normalizedUrl);

      const healthResponse = await fetch(engineEndpoint("/health"));
      if (!healthResponse.ok) {
        throw new Error("Local engine health check failed.");
      }

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
      clearEngineToken();
      setPairingState("error");
      setMessage("Could not reach or register the local engine.");
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

            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                Pairing token
              </span>
              <input
                value={token}
                onChange={(event) => setToken(event.target.value)}
                className="h-11 w-full rounded-lg border border-synth-border bg-synth-bg px-3 text-sm text-white outline-none transition-colors placeholder:text-gray-600 focus:border-synth-primary"
                placeholder="Desktop app token"
                type="password"
              />
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
            Pair
          </button>

          {pairingState === "paired" && (
            <button
              onClick={disconnect}
              className="inline-flex h-11 items-center gap-2 rounded-lg border border-synth-border bg-synth-bg px-3 text-sm font-semibold text-gray-300 transition-colors hover:border-red-400/70 hover:text-red-300"
              type="button"
            >
              <Unplug className="h-4 w-4" />
              Disconnect
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
