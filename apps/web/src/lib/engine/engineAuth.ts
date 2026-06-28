import { getEngineClientId } from "./engineClient.ts";

export const ENGINE_TOKEN_STORAGE_KEY = "pixelated_engine_token";
export const ENGINE_CONTROL_TOKEN_STORAGE_KEY = "pixelated_engine_control_token";
export const ENGINE_PAIRING_EVENT = "pixelated-engine-pairing-changed";
const COMPANION_TOKEN_PREFIX = "companion:";

export const getEngineToken = () =>
  window.localStorage.getItem(ENGINE_TOKEN_STORAGE_KEY) || "";

export const setEngineToken = (token: string) => {
  window.localStorage.setItem(ENGINE_TOKEN_STORAGE_KEY, token.trim());
  window.dispatchEvent(new Event(ENGINE_PAIRING_EVENT));
};

export const setEngineControlToken = (token: string) => {
  window.localStorage.setItem(ENGINE_CONTROL_TOKEN_STORAGE_KEY, token.trim());
  window.dispatchEvent(new Event(ENGINE_PAIRING_EVENT));
};

export const clearEngineToken = () => {
  window.localStorage.removeItem(ENGINE_TOKEN_STORAGE_KEY);
  window.localStorage.removeItem(ENGINE_CONTROL_TOKEN_STORAGE_KEY);
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
  const token =
    window.localStorage.getItem(ENGINE_CONTROL_TOKEN_STORAGE_KEY) ||
    getEngineToken();
  if (!token) return {};

  return {
    "X-Engine-Token": getCompanionAccessToken(token) || token,
    "X-Pixelated-Client-Id": getEngineClientId(),
  };
};
