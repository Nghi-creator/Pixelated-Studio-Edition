export const ENGINE_URL_STORAGE_KEY = "pixelated_engine_url";
export const ENGINE_CONTROL_URL_STORAGE_KEY = "pixelated_engine_control_url";

export const DEFAULT_ENGINE_URL =
  import.meta.env.VITE_ENGINE_URL || "http://localhost:8080";

export const ENGINE_URL = DEFAULT_ENGINE_URL;

export const getEngineUrl = () => {
  if (typeof window === "undefined") return DEFAULT_ENGINE_URL;
  return window.localStorage.getItem(ENGINE_URL_STORAGE_KEY) || DEFAULT_ENGINE_URL;
};

export const getEngineControlUrl = () => {
  if (typeof window === "undefined") return DEFAULT_ENGINE_URL;
  return window.localStorage.getItem(ENGINE_CONTROL_URL_STORAGE_KEY) || getEngineUrl();
};

export const setEngineUrl = (url: string) => {
  window.localStorage.setItem(ENGINE_URL_STORAGE_KEY, url.replace(/\/$/, ""));
};

export const setEngineControlUrl = (url: string) => {
  window.localStorage.setItem(
    ENGINE_CONTROL_URL_STORAGE_KEY,
    url.replace(/\/$/, ""),
  );
};

export const clearEngineUrl = () => {
  window.localStorage.removeItem(ENGINE_URL_STORAGE_KEY);
  window.localStorage.removeItem(ENGINE_CONTROL_URL_STORAGE_KEY);
};

export const engineEndpoint = (path: string) => {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${getEngineUrl()}${normalizedPath}`;
};
