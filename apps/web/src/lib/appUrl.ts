export const getPublicAppUrl = () => {
  const configuredUrl = import.meta.env.VITE_PUBLIC_APP_URL?.replace(/\/+$/, "");
  if (configuredUrl) return configuredUrl;

  if (typeof window === "undefined") return "";
  return window.location.origin;
};
