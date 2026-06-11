import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  PlugZap,
  RefreshCw,
  Server,
  ShieldCheck,
  Ticket,
  Trash2,
  Wifi,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { api, ApiError } from "../../lib/apiClient";
import {
  clearEngineToken,
  createCompanionEngineToken,
  ENGINE_PAIRING_EVENT,
  getCompanionAccessToken,
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

type InviteRedeemPayload = {
  code?: string;
  companionToken?: string;
  engineUrl?: string;
  error?: string;
  expiresAt?: string;
};

type LanPreflightPayload = {
  certificate?: {
    status?: "accepted";
  };
  engine?: {
    status?: "available" | "unavailable";
  };
  invite?: {
    expiresAt?: string | null;
    status?: "active" | "expired" | "revoked";
  };
  ready?: boolean;
};

type LanPreflightState =
  | { status: "idle" }
  | { status: "checking" }
  | { payload: LanPreflightPayload; status: "complete" }
  | { status: "unreachable" };

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

const getInviteFailureMessage = (status: number, code?: string) => {
  if (status === 401) return "That invite code was not accepted by the host.";
  if (code === "invite_expired") {
    return "That invite code expired. Ask the host to regenerate it.";
  }
  if (code === "invite_revoked") {
    return "That invite code was revoked. Ask the host to regenerate it.";
  }
  if (status === 410) {
    return "That invite code expired or was revoked. Ask the host for a fresh code.";
  }
  if (code === "host_engine_unavailable" || status === 503) {
    return "The join page is ready, but the host engine is unavailable. Ask the host to initialize or restart it.";
  }
  if (status >= 500) {
    return "The host join page is reachable, but invite redemption failed. Ask the host to restart LAN mode.";
  }
  return "Could not redeem that invite code.";
};

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

const fetchLanPreflight = async (engineUrl: string) => {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 4_000);

  try {
    const response = await fetch(
      engineUrlEndpoint(engineUrl, "/invite/preflight"),
      { cache: "no-store", signal: controller.signal },
    );
    if (!response.ok) {
      throw new Error("LAN join preflight failed.");
    }
    return (await response.json()) as LanPreflightPayload;
  } finally {
    window.clearTimeout(timeout);
  }
};

function PreflightRow({
  icon,
  label,
  message,
  tone,
}: {
  icon: ReactNode;
  label: string;
  message: string;
  tone: "checking" | "fail" | "pass" | "waiting";
}) {
  const toneClass =
    tone === "pass"
      ? "text-emerald-200"
      : tone === "fail"
        ? "text-red-200"
        : tone === "checking"
          ? "text-synth-secondary"
          : "text-gray-400";

  return (
    <li className={`flex items-start gap-2 ${toneClass}`}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span>
        <strong className="text-white">{label}:</strong> {message}
      </span>
    </li>
  );
}

export function EnginePairingPanel({
  compact = false,
  onPaired,
}: EnginePairingPanelProps) {
  const [engineUrl, setEngineUrlInput] = useState(getEngineUrl);
  const [inviteJoinRequested, setInviteJoinRequested] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("join") === "invite" && Boolean(params.get("companionUrl"));
  });
  const [inviteCode, setInviteCode] = useState("");
  const [token, setToken] = useState(getEngineToken);
  const [pairingState, setPairingState] = useState<PairingState>(
    token ? "paired" : "idle",
  );
  const [lanPreflight, setLanPreflight] = useState<LanPreflightState>(() => {
    const initialUrl = parseEngineUrl(getEngineUrl());
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
    const params = new URLSearchParams(window.location.search);
    const companionUrl = params.get("companionUrl");
    if (params.get("join") !== "invite" || !companionUrl) return;

    setEngineUrlInput(companionUrl);
    setInviteJoinRequested(true);
    setLanPreflight({ status: "checking" });
  }, []);

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
    const normalizedUrl = normalizeEngineUrl(engineUrl);
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
              <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
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
                className="h-11 w-full rounded-lg border border-synth-border bg-synth-bg px-3 text-sm text-white outline-none transition-colors placeholder:text-gray-600 focus:border-synth-primary"
                placeholder="http://localhost:8080 or http://192.168.1.20:8080"
              />
            </label>

            {isCompanionJoin ? (
              <label className="block">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                  Invite code
                </span>
                <input
                  value={inviteCode}
                  onChange={(event) =>
                    setInviteCode(
                      event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""),
                    )
                  }
                  className="h-11 w-full rounded-lg border border-synth-border bg-synth-bg px-3 font-mono text-sm tracking-widest text-white outline-none transition-colors placeholder:text-gray-600 focus:border-synth-primary"
                  maxLength={8}
                  placeholder="A1B2C3D4"
                />
              </label>
            ) : (
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
            )}
          </div>

          {(isCompanionJoin || engineUrlScope !== "local") && (
            <div
              className={`mt-3 rounded-lg border px-3 py-2 text-xs leading-5 ${
                engineUrlScope === "lan"
                  ? "border-amber-400/30 bg-amber-400/10 text-amber-200"
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
            <div className="mt-3 rounded-lg border border-synth-border bg-synth-bg px-3 py-3 text-xs leading-5">
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold uppercase tracking-wide text-gray-300">
                  LAN join checks
                </span>
                <button
                  className="inline-flex items-center gap-1 font-semibold text-synth-secondary transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={lanPreflight.status === "checking"}
                  onClick={() => void retryLanPreflight()}
                  type="button"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${
                      lanPreflight.status === "checking" ? "animate-spin" : ""
                    }`}
                  />
                  Check again
                </button>
              </div>
              <ul className="mt-2 space-y-1.5">
                <PreflightRow
                  icon={<ShieldCheck className="h-4 w-4" />}
                  label="Certificate"
                  message={
                    lanPreflight.status === "unreachable"
                      ? "Trust required. Open this HTTPS join URL directly and accept the browser warning."
                      : lanPreflight.status === "complete"
                        ? "Accepted for this join page."
                        : "Checking HTTPS trust..."
                  }
                  tone={
                    lanPreflight.status === "unreachable"
                      ? "fail"
                      : lanPreflight.status === "complete"
                        ? "pass"
                        : "checking"
                  }
                />
                <PreflightRow
                  icon={<Ticket className="h-4 w-4" />}
                  label="Invite"
                  message={
                    lanPreflight.status === "complete"
                      ? lanPreflight.payload.invite?.status === "active"
                        ? `Active${
                            lanPreflight.payload.invite.expiresAt
                              ? ` until ${new Date(
                                  lanPreflight.payload.invite.expiresAt,
                                ).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}`
                              : ""
                          }.`
                        : lanPreflight.payload.invite?.status === "expired"
                          ? "Expired. Ask the host to regenerate the code."
                          : "Revoked. Ask the host to regenerate the code."
                      : "Waiting for the HTTPS join page."
                  }
                  tone={
                    lanPreflight.status !== "complete"
                      ? "waiting"
                      : lanPreflight.payload.invite?.status === "active"
                        ? "pass"
                        : "fail"
                  }
                />
                <PreflightRow
                  icon={
                    lanPreflight.status === "complete" &&
                    lanPreflight.payload.engine?.status === "unavailable" ? (
                      <AlertTriangle className="h-4 w-4" />
                    ) : (
                      <Server className="h-4 w-4" />
                    )
                  }
                  label="Host engine"
                  message={
                    lanPreflight.status === "complete"
                      ? lanPreflight.payload.engine?.status === "available"
                        ? "Available."
                        : "Unavailable. Ask the host to initialize or restart it."
                      : "Waiting for the HTTPS join page."
                  }
                  tone={
                    lanPreflight.status !== "complete"
                      ? "waiting"
                      : lanPreflight.payload.engine?.status === "available"
                        ? "pass"
                        : "fail"
                  }
                />
              </ul>
              {lanPreflight.status === "unreachable" && (
                <a
                  className="mt-2 inline-flex font-semibold text-synth-secondary underline underline-offset-2 hover:text-white"
                  href={normalizeEngineUrl(engineUrl)}
                  rel="noreferrer"
                  target="_blank"
                >
                  Open HTTPS join page to trust certificate
                </a>
              )}
            </div>
          )}

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
            disabled={
              pairingState === "checking" ||
              (isCompanionJoin && pairingState !== "paired" && !preflightReady)
            }
            className="inline-flex h-11 items-center gap-2 rounded-lg border border-synth-primary/70 bg-synth-primary/15 px-4 text-sm font-semibold text-white transition-colors hover:bg-synth-primary/25 disabled:cursor-not-allowed disabled:opacity-60"
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
