export const ENGINE_TOKEN_STORAGE_KEY = "pixelated_engine_token";
export const ENGINE_PAIRING_EVENT = "pixelated-engine-pairing-changed";

export const getEngineToken = () =>
  window.localStorage.getItem(ENGINE_TOKEN_STORAGE_KEY) || "";

export const setEngineToken = (token: string) => {
  window.localStorage.setItem(ENGINE_TOKEN_STORAGE_KEY, token.trim());
  window.dispatchEvent(new Event(ENGINE_PAIRING_EVENT));
};

export const clearEngineToken = () => {
  window.localStorage.removeItem(ENGINE_TOKEN_STORAGE_KEY);
  window.dispatchEvent(new Event(ENGINE_PAIRING_EVENT));
};

export const hasEngineToken = () => Boolean(getEngineToken());

export const ensureEngineToken = () => getEngineToken();

export const engineAuthHeaders = (): Record<string, string> => {
  const token = getEngineToken();
  return token ? { "X-Engine-Token": token } : {};
};
