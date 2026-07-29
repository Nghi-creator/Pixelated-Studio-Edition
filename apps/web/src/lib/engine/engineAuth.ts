import { getEngineClientId } from "./engineClient.ts";
import {
  type EngineConnectionStatus,
  setEngineConnectionStatus,
} from "./engineConnectionState.ts";
import {
  ENGINE_CONTROL_TOKEN_STORAGE_KEY,
  ENGINE_TOKEN_EXPIRES_AT_STORAGE_KEY,
  ENGINE_TOKEN_STORAGE_KEY,
} from "./engineStorageKeys.ts";

export {
  ENGINE_CONTROL_TOKEN_STORAGE_KEY,
  ENGINE_TOKEN_EXPIRES_AT_STORAGE_KEY,
  ENGINE_TOKEN_STORAGE_KEY,
} from "./engineStorageKeys.ts";
export const ENGINE_PAIRING_EVENT = "pixelated-engine-pairing-changed";
const COMPANION_TOKEN_PREFIX = "companion:";

function getStoredEngineToken() {
  const token = window.localStorage.getItem(ENGINE_TOKEN_STORAGE_KEY) || "";
  const expiresAt = Number(
    window.localStorage.getItem(ENGINE_TOKEN_EXPIRES_AT_STORAGE_KEY),
  );
  if (
    token &&
    Number.isFinite(expiresAt) &&
    expiresAt > 0 &&
    expiresAt <= Date.now()
  ) {
    window.localStorage.removeItem(ENGINE_TOKEN_STORAGE_KEY);
    window.localStorage.removeItem(ENGINE_CONTROL_TOKEN_STORAGE_KEY);
    window.localStorage.removeItem(ENGINE_TOKEN_EXPIRES_AT_STORAGE_KEY);
    return "";
  }
  return token;
}

export const getEngineToken = () => getStoredEngineToken();

export const setEngineToken = (token: string, expiresAt?: string) => {
  window.localStorage.setItem(ENGINE_TOKEN_STORAGE_KEY, token.trim());
  const expiresAtMs = expiresAt ? Date.parse(expiresAt) : Number.NaN;
  if (Number.isFinite(expiresAtMs) && expiresAtMs > Date.now()) {
    window.localStorage.setItem(
      ENGINE_TOKEN_EXPIRES_AT_STORAGE_KEY,
      String(expiresAtMs),
    );
  } else {
    window.localStorage.removeItem(ENGINE_TOKEN_EXPIRES_AT_STORAGE_KEY);
  }
  setEngineConnectionStatus("checking");
  window.dispatchEvent(new Event(ENGINE_PAIRING_EVENT));
};

export const setEngineControlToken = (token: string) => {
  window.localStorage.setItem(ENGINE_CONTROL_TOKEN_STORAGE_KEY, token.trim());
  window.dispatchEvent(new Event(ENGINE_PAIRING_EVENT));
};

export const clearEngineToken = (
  status: Extract<EngineConnectionStatus, "rejected" | "unpaired"> = "unpaired",
) => {
  window.localStorage.removeItem(ENGINE_TOKEN_STORAGE_KEY);
  window.localStorage.removeItem(ENGINE_CONTROL_TOKEN_STORAGE_KEY);
  window.localStorage.removeItem(ENGINE_TOKEN_EXPIRES_AT_STORAGE_KEY);
  setEngineConnectionStatus(status);
  window.dispatchEvent(new Event(ENGINE_PAIRING_EVENT));
};

export const hasEngineToken = () => Boolean(getEngineToken());

export const ensureEngineToken = () => getEngineToken();

export const createCompanionEngineToken = (token: string) =>
  `${COMPANION_TOKEN_PREFIX}${token.trim()}`;

export const getCompanionAccessToken = (token = getEngineToken()) =>
  token.startsWith(COMPANION_TOKEN_PREFIX)
    ? token.slice(COMPANION_TOKEN_PREFIX.length)
    : "";

export const isCompanionEngineToken = (token = getEngineToken()) =>
  Boolean(getCompanionAccessToken(token));

export const engineAuthHeaders = (): Record<string, string> => {
  const token = getEngineToken();
  if (!token) return {};

  return {
    "X-Engine-Token": getCompanionAccessToken(token) || token,
    "X-Pixelated-Client-Id": getEngineClientId(),
  };
};

export const engineControlAuthHeaders = (): Record<string, string> => {
  const engineToken = getEngineToken();
  const token =
    (engineToken &&
      window.localStorage.getItem(ENGINE_CONTROL_TOKEN_STORAGE_KEY)) ||
    engineToken;
  if (!token) return {};

  return {
    "X-Engine-Token": getCompanionAccessToken(token) || token,
    "X-Pixelated-Client-Id": getEngineClientId(),
  };
};
