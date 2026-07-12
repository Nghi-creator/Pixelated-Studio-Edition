import { isLikelyCompanionUrl } from "./inviteUtils.ts";
import {
  engineFetch,
  EngineRequestTimeoutError,
} from "../../lib/engine/engineRequest.ts";
import type {
  EngineUrlScope,
  LanPreflightPayload,
} from "./pairingTypes";

type PairingFailureContext = {
  error: unknown;
  parsedUrl: URL;
  scope: EngineUrlScope;
  status?: number;
};

export const normalizeEngineUrl = (url: string) =>
  url.trim().replace(/\/+$/, "");

export const normalizePairingEngineUrl = (url: string) => {
  const normalizedUrl = normalizeEngineUrl(url);
  const parsedUrl = parseEngineUrl(normalizedUrl);

  if (
    parsedUrl &&
    parsedUrl.protocol === "https:" &&
    parsedUrl.port === "8080" &&
    ["localhost", "127.0.0.1", "::1", "[::1]"].includes(
      parsedUrl.hostname.toLowerCase(),
    )
  ) {
    parsedUrl.protocol = "http:";
    return normalizeEngineUrl(parsedUrl.toString());
  }

  return normalizedUrl;
};

export const engineUrlEndpoint = (url: string, path: string) => {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizeEngineUrl(url)}${normalizedPath}`;
};

export const parseEngineUrl = (url: string) => {
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

export const getEngineUrlScope = (url: string): EngineUrlScope => {
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

export const getScopeLabel = (scope: EngineUrlScope) => {
  if (scope === "lan") return "LAN engine";
  if (scope === "custom") return "Custom engine";
  return "Local engine";
};

export const getScopeDescription = (scope: EngineUrlScope) => {
  if (scope === "lan") {
    return "Connects to an engine exposed on your local network. Use only with a token from someone you trust.";
  }

  if (scope === "custom") {
    return "Connects to a custom engine URL. Make sure you trust the host before pairing.";
  }

  return "Connects to an engine running on this computer.";
};

export const getPairingFailureMessage = ({
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

  if (error instanceof EngineRequestTimeoutError) {
    return "The engine did not respond in time. Keep the desktop app open, then try pairing again.";
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

export const fetchLanPreflight = async (engineUrl: string) => {
  const response = await engineFetch(
    engineUrlEndpoint(engineUrl, "/invite/preflight"),
    { cache: "no-store" },
    4_000,
  );
  if (!response.ok) {
    throw new Error("LAN join preflight failed.");
  }
  return (await response.json()) as LanPreflightPayload;
};
