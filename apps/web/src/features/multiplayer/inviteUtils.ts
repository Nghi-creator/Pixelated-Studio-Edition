import { isLocalOrLanEngineHostname } from "../../lib/network/privateHost.ts";

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

const isDesktopCompanionInvite = (inviteUrl: URL) => {
  return (
    inviteUrl.protocol === "https:" &&
    isLocalOrLanEngineHostname(inviteUrl.hostname)
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
