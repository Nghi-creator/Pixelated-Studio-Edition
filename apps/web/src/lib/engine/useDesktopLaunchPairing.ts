import { useEffect } from "react";
import { api } from "../apiClient";
import {
  createCompanionEngineToken,
  engineAuthHeaders,
  setEngineToken,
} from "./engineAuth";
import { setEngineUrl } from "./engineConfig";

type LaunchRedemption = {
  companionToken?: string;
};

export function useDesktopLaunchPairing() {
  useEffect(() => {
    const url = new URL(window.location.href);
    const engineUrl = url.searchParams.get("engineUrl");
    const engineToken = url.searchParams.get("engineToken");
    const launchTicket = url.searchParams.get("launchTicket");
    const companionUrl = url.searchParams.get("companionUrl");

    if (engineUrl && engineToken) {
      setEngineUrl(engineUrl);
      setEngineToken(engineToken);
      fetch(`${engineUrl}/local-games`, {
        cache: "no-store",
        headers: {
          "X-Engine-Token": engineToken,
          "X-User-Id": "connection-monitor",
        },
      }).catch((error) => {
        console.warn("Desktop launch client presence ping failed.", error);
      });
      url.searchParams.delete("engineUrl");
      url.searchParams.delete("engineToken");
      window.history.replaceState({}, "", url);

      void api.pairLocalEngine(engineUrl).catch((error) => {
        console.warn(
          "Desktop launch pairing registration v1 failed after local launch.",
          error,
        );
      });
      return;
    }

    if (!launchTicket || !companionUrl) return;

    const pairFromDesktop = async () => {
      try {
        const response = await fetch(`${companionUrl}/launch/redeem`, {
          body: JSON.stringify({ ticket: launchTicket }),
          headers: { "content-type": "application/json" },
          method: "POST",
        });
        const payload = (await response.json()) as LaunchRedemption;
        if (!response.ok || !payload.companionToken) {
          console.error(
            `Desktop launch pairing failed with status ${response.status}.`,
          );
          return;
        }

        setEngineUrl(companionUrl);
        setEngineToken(createCompanionEngineToken(payload.companionToken));
        fetch(`${companionUrl}/local-games`, {
          cache: "no-store",
          headers: {
            "X-User-Id": "connection-monitor",
            ...engineAuthHeaders(),
          },
        }).catch((error) => {
          console.warn("Desktop launch client presence ping failed.", error);
        });
        url.searchParams.delete("companionUrl");
        url.searchParams.delete("launchTicket");
        window.history.replaceState({}, "", url);

        try {
          await api.pairLocalEngine(companionUrl);
        } catch (error) {
          console.warn(
            "Desktop launch pairing registration v1 failed after local redemption.",
            error,
          );
        }
      } catch (error) {
        console.error(
          "Desktop launch pairing could not reach the companion.",
          error,
        );
      }
    };

    void pairFromDesktop();
  }, []);
}
