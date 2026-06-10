import { useEffect } from "react";
import { createCompanionEngineToken, setEngineToken } from "./engineAuth";
import { setEngineUrl } from "./engineConfig";

type LaunchRedemption = {
  companionToken?: string;
};

export function useDesktopLaunchPairing() {
  useEffect(() => {
    const url = new URL(window.location.href);
    const launchTicket = url.searchParams.get("launchTicket");
    const companionUrl = url.searchParams.get("companionUrl");
    if (!launchTicket || !companionUrl) return;

    const pairFromDesktop = async () => {
      const response = await fetch(`${companionUrl}/launch/redeem`, {
        body: JSON.stringify({ ticket: launchTicket }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json()) as LaunchRedemption;
      if (!response.ok || !payload.companionToken) return;

      setEngineUrl(companionUrl);
      setEngineToken(createCompanionEngineToken(payload.companionToken));
      url.searchParams.delete("companionUrl");
      url.searchParams.delete("launchTicket");
      window.history.replaceState({}, "", url);
    };

    void pairFromDesktop();
  }, []);
}
