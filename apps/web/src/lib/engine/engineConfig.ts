export const ENGINE_URL_STORAGE_KEY = "pixelated_engine_url";
export const ENGINE_CONTROL_URL_STORAGE_KEY = "pixelated_engine_control_url";

const viteEnv = import.meta.env || {};
export const DEFAULT_ENGINE_URL =
  viteEnv.VITE_ENGINE_URL || "http://localhost:8080";

export const ENGINE_URL = DEFAULT_ENGINE_URL;

const ALLOWED_ENGINE_PORTS = new Set(["8080", "8090", "8091"]);

function normalizeEngineUrl(url: string) {
  return url.trim().replace(/\/+$/, "");
}

function isLocalEngineHostname(hostname: string) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]"
  );
}

function isPrivateIpv4(hostname: string) {
  const parts = hostname.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
    return false;
  }

  const [first, second] = parts;
  return (
    first === 10 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 169 && second === 254)
  );
}

export function isAllowedEngineUrl(value: string) {
  try {
    const url = new URL(normalizeEngineUrl(value));
    const hostname = url.hostname.toLowerCase();
    const isAllowedHost =
      isLocalEngineHostname(hostname) ||
      isPrivateIpv4(hostname) ||
      hostname.endsWith(".local");

    return (
      ["http:", "https:"].includes(url.protocol) &&
      isAllowedHost &&
      ALLOWED_ENGINE_PORTS.has(url.port) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

export const getEngineUrl = () => {
  if (typeof window === "undefined") return DEFAULT_ENGINE_URL;
  const storedUrl = window.localStorage.getItem(ENGINE_URL_STORAGE_KEY);
  return storedUrl && isAllowedEngineUrl(storedUrl)
    ? normalizeEngineUrl(storedUrl)
    : DEFAULT_ENGINE_URL;
};

export const getEngineControlUrl = () => {
  if (typeof window === "undefined") return DEFAULT_ENGINE_URL;
  const storedUrl = window.localStorage.getItem(ENGINE_CONTROL_URL_STORAGE_KEY);
  return storedUrl && isAllowedEngineUrl(storedUrl)
    ? normalizeEngineUrl(storedUrl)
    : getEngineUrl();
};

export const getLocalCompanionControlUrl = (engineUrl = getEngineUrl()) => {
  try {
    const url = new URL(engineUrl);
    const hostname = url.hostname.toLowerCase();
    const isLocalhost =
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname === "[::1]";

    if (!isLocalhost || url.port !== "8080") return null;

    url.protocol = "http:";
    url.port = "8091";
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
};

export const setEngineUrl = (url: string) => {
  const normalizedUrl = normalizeEngineUrl(url);
  if (!isAllowedEngineUrl(normalizedUrl)) {
    throw new Error("Engine URL must point to a local or LAN engine.");
  }
  window.localStorage.setItem(ENGINE_URL_STORAGE_KEY, normalizedUrl);
};

export const setEngineControlUrl = (url: string) => {
  const normalizedUrl = normalizeEngineUrl(url);
  if (!isAllowedEngineUrl(normalizedUrl)) {
    throw new Error("Engine control URL must point to a local or LAN engine.");
  }
  window.localStorage.setItem(ENGINE_CONTROL_URL_STORAGE_KEY, normalizedUrl);
};

export const clearEngineUrl = () => {
  window.localStorage.removeItem(ENGINE_URL_STORAGE_KEY);
  window.localStorage.removeItem(ENGINE_CONTROL_URL_STORAGE_KEY);
};

export const engineEndpoint = (path: string) => {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const engineUrl = getEngineUrl();
  if (!isAllowedEngineUrl(engineUrl)) {
    throw new Error("Engine URL must point to a local or LAN engine.");
  }
  return `${engineUrl}${normalizedPath}`;
};
