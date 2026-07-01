import { useMemo } from "react";
import type { Location } from "react-router-dom";
import type { EngineShareContext } from "../../../lib/webrtc/useWebRTC";

export function usePlayerShareInvite({
  location,
  sessionId,
  shareContext,
}: {
  location: Location;
  sessionId: string;
  shareContext: EngineShareContext;
}) {
  const directShareUrl = useMemo(() => {
    const nextSearch = new URLSearchParams(location.search);
    nextSearch.set("session", sessionId);
    nextSearch.set("role", "spectator");
    return `${window.location.origin}${location.pathname}?${nextSearch.toString()}`;
  }, [location.pathname, location.search, sessionId]);

  return useMemo(() => {
    const companionUrl = shareContext.companionUrls[0];
    if (shareContext.exposureMode !== "lan" || !companionUrl) {
      return {
        guidance: null,
        text: directShareUrl,
        url: directShareUrl,
      };
    }

    let url: URL;
    try {
      const companionOrigin = new URL(companionUrl);
      if (companionOrigin.protocol !== "https:") {
        throw new Error("LAN companion URL must use HTTPS.");
      }
      url = new URL(directShareUrl);
      url.protocol = companionOrigin.protocol;
      url.host = companionOrigin.host;
    } catch {
      return {
        guidance: null,
        text: directShareUrl,
        url: directShareUrl,
      };
    }

    const guidance =
      "Open this HTTPS join link, then enter the short-lived invite code shown in the host's Pixelated Desktop app.";

    return {
      guidance,
      text: `${url.toString()}\n\n${guidance}`,
      url: url.toString(),
    };
  }, [directShareUrl, shareContext]);
}
