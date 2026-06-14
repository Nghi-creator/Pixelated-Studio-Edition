export const isLikelyCompanionUrl = (url: URL) =>
  url.protocol === "https:" && url.port === "8090";

export const getInviteCompanionUrl = (search: string) => {
  const params = new URLSearchParams(search);
  if (params.get("join") !== "invite") return null;
  return params.get("companionUrl");
};

export const getInviteFailureMessage = (status: number, code?: string) => {
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
