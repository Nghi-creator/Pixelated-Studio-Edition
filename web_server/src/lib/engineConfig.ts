export const ENGINE_URL =
  import.meta.env.VITE_ENGINE_URL || "http://localhost:8080";

export const engineEndpoint = (path: string) => {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${ENGINE_URL}${normalizedPath}`;
};

