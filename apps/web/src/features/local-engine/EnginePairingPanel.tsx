import {
  Eye,
  EyeOff,
  Loader2,
  Trash2,
  Wifi,
} from "lucide-react";
import { useEffect, useState } from "react";
import { api, ApiError } from "../../lib/apiClient";
import {
  clearEngineToken,
  createCompanionEngineToken,
  ENGINE_PAIRING_EVENT,
  getCompanionAccessToken,
  getEngineToken,
  setEngineToken,
} from "../../lib/engine/engineAuth";
import {
  clearEngineUrl,
  DEFAULT_ENGINE_URL,
  getEngineUrl,
  setEngineUrl,
} from "../../lib/engine/engineConfig";
import {
  getInviteCompanionUrl,
  getInviteFailureMessage,
  isLikelyCompanionUrl,
} from "./inviteUtils";
import type {
  EngineHealthPayload,
  InviteRedeemPayload,
  LanPreflightState,
  PairingState,
} from "./pairingTypes";
import {
  engineUrlEndpoint,
  fetchLanPreflight,
  getEngineUrlScope,
  getPairingFailureMessage,
  getScopeDescription,
  getScopeLabel,
  normalizeEngineUrl,
  normalizePairingEngineUrl,
  parseEngineUrl,
} from "./pairingUtils";
import { LanPreflightChecks } from "./LanPreflightChecks";
import { PixelIcon } from "../../components/ui/PixelIcon";

type EnginePairingPanelProps = {
  compact?: boolean;
  onPaired?: () => void;
};

export function EnginePairingPanel({
  compact = false,
  onPaired,
}: EnginePairingPanelProps) {
  const [engineUrl, setEngineUrlInput] = useState(
    () => getInviteCompanionUrl(window.location.search) || getEngineUrl(),
  );
  const [inviteJoinRequested, setInviteJoinRequested] = useState(
    () => Boolean(getInviteCompanionUrl(window.location.search)),
  );
  const [inviteCode, setInviteCode] = useState("");
  const [token, setToken] = useState(getEngineToken);
  const [pairingState, setPairingState] = useState<PairingState>(
    token ? "paired" : "idle",
  );
  const [lanPreflight, setLanPreflight] = useState<LanPreflightState>(() => {
    const initialUrl = parseEngineUrl(
      getInviteCompanionUrl(window.location.search) || getEngineUrl(),
    );
    return {
      status:
        initialUrl && isLikelyCompanionUrl(initialUrl) ? "checking" : "idle",
    };
  });
  const [showToken, setShowToken] = useState(false);
  const [message, setMessage] = useState(
    token
      ? `${getScopeLabel(getEngineUrlScope(getEngineUrl()))} token is saved in this browser.`
      : "",
  );
  const engineUrlScope = getEngineUrlScope(engineUrl);
  const parsedEngineUrl = parseEngineUrl(engineUrl);
  const isCompanionJoin = Boolean(
    inviteJoinRequested &&
      parsedEngineUrl &&
      isLikelyCompanionUrl(parsedEngineUrl),
  );
  const preflightReady =
    lanPreflight.status === "complete" && lanPreflight.payload.ready === true;

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
    const currentUrl = parseEngineUrl(getEngineUrl());
    if (currentUrl && isLikelyCompanionUrl(currentUrl)) return;

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

  useEffect(() => {
    const parsedUrl = parseEngineUrl(engineUrl);
    if (!isCompanionJoin || !parsedUrl || !isLikelyCompanionUrl(parsedUrl)) return;

    let active = true;
    const checkPreflight = () => {
      fetchLanPreflight(normalizeEngineUrl(engineUrl))
        .then((payload) => {
          if (active) setLanPreflight({ payload, status: "complete" });
        })
        .catch(() => {
          if (active) setLanPreflight({ status: "unreachable" });
        });
    };
    checkPreflight();
    const interval = window.setInterval(checkPreflight, 5_000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [engineUrl, isCompanionJoin]);

  const retryLanPreflight = async () => {
    const normalizedUrl = normalizeEngineUrl(engineUrl);
    setLanPreflight({ status: "checking" });
    try {
      const payload = await fetchLanPreflight(normalizedUrl);
      setLanPreflight({ payload, status: "complete" });
    } catch {
      setLanPreflight({ status: "unreachable" });
    }
  };

  const pairEngine = async () => {
    const normalizedUrl = normalizePairingEngineUrl(engineUrl);
    if (normalizedUrl !== normalizeEngineUrl(engineUrl)) {
      setEngineUrlInput(normalizedUrl);
    }
    const parsedUrl = parseEngineUrl(normalizedUrl);
    const joiningWithInvite = Boolean(
      inviteJoinRequested && parsedUrl && isLikelyCompanionUrl(parsedUrl),
    );
    const normalizedInviteCode = inviteCode
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
    let normalizedToken = token.trim();

    if (!normalizedUrl || (!joiningWithInvite && !normalizedToken)) {
      setPairingState("error");
      setMessage("Enter the engine URL and desktop pairing token.");
      return;
    }

    if (joiningWithInvite && !normalizedInviteCode) {
      setPairingState("error");
      setMessage("Enter the invite code from the host desktop app.");
      return;
    }

    if (joiningWithInvite && !preflightReady) {
      setPairingState("error");
      setMessage("Complete the LAN join checks before entering the invite code.");
      return;
    }

    if (!parsedUrl) {
      setPairingState("error");
      setMessage("Enter a valid engine URL, including http:// or https://.");
      return;
    }

    setPairingState("checking");
    setMessage(
      joiningWithInvite
        ? "Checking invite code..."
        : `Checking ${getScopeLabel(getEngineUrlScope(normalizedUrl)).toLowerCase()}...`,
    );

    try {
      if (joiningWithInvite) {
        const inviteResponse = await fetch(
          engineUrlEndpoint(normalizedUrl, "/invite/redeem"),
          {
            body: JSON.stringify({ code: normalizedInviteCode }),
            headers: { "Content-Type": "application/json" },
            method: "POST",
          },
        );

        if (!inviteResponse.ok) {
          const failurePayload =
            (await inviteResponse.json().catch(() => ({}))) as InviteRedeemPayload;
          setPairingState("error");
          setMessage(
            getInviteFailureMessage(inviteResponse.status, failurePayload.code),
          );
          if ([410, 503].includes(inviteResponse.status)) {
            void retryLanPreflight();
          }
          return;
        }

        const invitePayload =
          (await inviteResponse.json()) as InviteRedeemPayload;
        if (!invitePayload.companionToken) {
          setPairingState("error");
          setMessage("The host join page did not return a companion credential.");
          return;
        }

        normalizedToken = createCompanionEngineToken(
          invitePayload.companionToken,
        );
      }

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
            "X-Engine-Token":
              getCompanionAccessToken(normalizedToken) || normalizedToken,
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
        joiningWithInvite
          ? "Joined the host engine. Keep this page open while you play."
          : actualScope === "lan"
            ? "LAN engine paired. Keep the desktop app running while guests connect."
            : "Local engine paired.";

      try {
        await api.pairLocalEngine(normalizedUrl);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          successMessage =
            joiningWithInvite
              ? "Joined the host engine. Sign in to register pairing intent with the API."
              : "Engine token saved locally. Sign in to register pairing intent with the API.";
        } else {
          console.warn("Local engine paired, but API registration failed:", err);
          successMessage =
            joiningWithInvite
              ? "Joined the host engine. Backend pairing registration is unavailable."
              : "Engine token saved locally. Backend pairing registration is unavailable.";
        }
      }

      setPairingState("paired");
      setInviteJoinRequested(false);
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
      className={`w-full border border-[#6A2941] bg-[#2B1720] ${
        compact ? "rounded-lg p-4" : "rounded-lg p-5"
      }`}
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-end">
        <div className="min-w-0 flex-1">
          <div className="mb-3 flex items-center gap-2">
            {pairingState === "paired" ? (
              <PixelIcon className="h-5 w-5 text-[#C02066]" name="engine-on" />
            ) : engineUrlScope === "lan" ? (
              <Wifi className="h-5 w-5 text-amber-400" />
            ) : (
              <PixelIcon className="h-5 w-5 text-amber-400" name="engine-off" />
            )}
            <h3 className="text-base font-semibold text-white">
              {isCompanionJoin ? "Join Host Engine" : "Local Engine Pairing"}
            </h3>
          </div>

          <div
            className={`grid gap-3 ${
              isCompanionJoin
                ? "md:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)]"
                : "md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]"
            }`}
          >
            <label className="block">
              <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-[#F38BB4]">
                Engine URL
              </span>
              <input
                value={engineUrl}
                onChange={(event) => {
                  const nextUrl = event.target.value;
                  const parsedNextUrl = parseEngineUrl(nextUrl);
                  setEngineUrlInput(nextUrl);
                  setInviteJoinRequested(false);
                  setLanPreflight({
                    status:
                      parsedNextUrl && isLikelyCompanionUrl(parsedNextUrl)
                        ? "checking"
                        : "idle",
                  });
                }}
                className="h-11 w-full rounded-lg border border-[#7E3250] bg-synth-bg px-3 text-sm text-white outline-none transition-colors placeholder:text-gray-600 focus:border-[#C01662]"
                placeholder="http://localhost:8080 or http://192.168.1.20:8080"
              />
            </label>

            {isCompanionJoin ? (
              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-[#F38BB4]">
                  Invite code
                </span>
                <input
                  value={inviteCode}
                  onChange={(event) =>
                    setInviteCode(
                      event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""),
                    )
                  }
                  className="h-11 w-full rounded-lg border border-[#7E3250] bg-synth-bg px-3 font-mono text-sm tracking-widest text-white outline-none transition-colors placeholder:text-gray-600 focus:border-[#C01662]"
                  maxLength={8}
                  placeholder="A1B2C3D4"
                />
              </label>
            ) : (
              <label className="relative block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-[#F38BB4]">
                  Pairing token
                </span>
                <input
                  value={token}
                  onChange={(event) => setToken(event.target.value)}
                  className="h-11 w-full rounded-lg border border-[#7E3250] bg-synth-bg px-3 pr-11 text-sm text-white outline-none transition-colors placeholder:text-gray-600 focus:border-[#C01662]"
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
            )}
          </div>

          {(isCompanionJoin || engineUrlScope !== "local") && (
            <div
              className={`mt-3 rounded-lg border px-3 py-2 text-xs leading-5 ${
                engineUrlScope === "lan"
                  ? "border-synth-primary/30 bg-synth-bg text-synth-secondary"
                  : "border-synth-border bg-synth-bg text-gray-400"
              }`}
            >
              <span className="font-semibold text-white">
                {isCompanionJoin
                  ? "HTTPS join page"
                  : getScopeLabel(engineUrlScope)}
                :
              </span>{" "}
              {isCompanionJoin
                ? "Enter the short-lived invite code from the host desktop app. The raw engine token stays on the host."
                : getScopeDescription(engineUrlScope)}
            </div>
          )}

          {isCompanionJoin && (
            <LanPreflightChecks
              engineUrl={engineUrl}
              preflight={lanPreflight}
              retry={() => void retryLanPreflight()}
            />
          )}

          {message && (
            <p
              className={`mt-3 text-sm ${
                pairingState === "error" ? "text-red-300" : "text-gray-300"
              }`}
            >
              {message}
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-nowrap gap-2 md:self-start md:pt-14">
          <button
            onClick={pairEngine}
            disabled={
              pairingState === "checking" ||
              (isCompanionJoin && pairingState !== "paired" && !preflightReady)
            }
            className="inline-flex h-11 items-center gap-2 whitespace-nowrap rounded-lg border border-[#C02066] bg-[#9B0048] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#B00052] disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
          >
            {pairingState === "checking" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            {isCompanionJoin
              ? pairingState === "paired"
                ? "Update"
                : "Join"
              : pairingState === "paired"
                ? "Update"
                : "Pair"}
          </button>

          {pairingState === "paired" && (
            <button
              onClick={disconnect}
              className="inline-flex h-11 items-center gap-2 whitespace-nowrap rounded-lg border border-synth-border bg-synth-bg px-3 text-sm font-semibold text-gray-300 transition-colors hover:border-red-400/70 hover:text-red-300"
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
