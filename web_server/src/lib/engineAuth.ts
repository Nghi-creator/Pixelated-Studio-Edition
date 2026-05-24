export const ENGINE_TOKEN_STORAGE_KEY = "pixelated_engine_token";

export const getEngineToken = () =>
  window.localStorage.getItem(ENGINE_TOKEN_STORAGE_KEY) || "";

export const setEngineToken = (token: string) => {
  window.localStorage.setItem(ENGINE_TOKEN_STORAGE_KEY, token.trim());
};

export const clearEngineToken = () => {
  window.localStorage.removeItem(ENGINE_TOKEN_STORAGE_KEY);
};

export const ensureEngineToken = () => {
  const existingToken = getEngineToken();
  if (existingToken) return existingToken;

  const token = window.prompt(
    "Enter the pairing token shown in the PIXELATED Studio desktop app.",
  );

  if (!token?.trim()) return "";

  setEngineToken(token);
  return token.trim();
};

export const engineAuthHeaders = (): Record<string, string> => {
  const token = ensureEngineToken();
  return token ? { "X-Engine-Token": token } : {};
};
