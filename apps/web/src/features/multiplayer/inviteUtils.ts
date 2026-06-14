const getInvitePath = (invite: string) => {
  const trimmedInvite = invite.trim().split(/\s+/)[0];
  if (!trimmedInvite) return null;

  try {
    const inviteUrl = new URL(trimmedInvite, window.location.origin);
    if (!["http:", "https:"].includes(inviteUrl.protocol)) return null;
    return inviteUrl;
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

const isDesktopCompanionInvite = (inviteUrl: URL) => {
  const hostname = inviteUrl.hostname.toLowerCase();
  return (
    inviteUrl.protocol === "https:" &&
    (isPrivateIpv4(hostname) ||
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname === "[::1]" ||
      hostname.endsWith(".local"))
  );
};

export const getJoinInvite = (invite: string) => {
  const inviteUrl = getInvitePath(invite);
  if (!inviteUrl || !inviteUrl.pathname.startsWith("/play/")) return null;

  return {
    isCompanion: isDesktopCompanionInvite(inviteUrl),
    target: `${inviteUrl.pathname}${inviteUrl.search}`,
    url: inviteUrl.toString(),
  };
};

export const getSessionFromInvite = (invite: string) => {
  const inviteUrl = getInvitePath(invite);
  return inviteUrl?.searchParams.get("session") || "";
};

