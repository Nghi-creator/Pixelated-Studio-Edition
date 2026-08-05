import { useEffect } from "react";
import { useNavigate } from "react-router";
import { api } from "../../lib/api/apiClient";
import { pairFromDesktopLaunchUrl } from "../../lib/engine/desktopLaunchPairing";
import {
  createCompanionEngineToken,
  engineAuthHeaders,
  setEngineControlToken,
  setEngineToken,
} from "../../lib/engine/engineAuth";
import { setEngineConnectionStatus } from "../../lib/engine/engineConnectionState";
import { setEngineControlUrl, setEngineUrl } from "../../lib/engine/engineConfig";

export function useDesktopLaunchPairing() {
  const navigate = useNavigate();

  useEffect(() => {
    void pairFromDesktopLaunchUrl(new URL(window.location.href), {
      createCompanionEngineToken,
      engineAuthHeaders,
      fetch: window.fetch.bind(window),
      pairLocalEngine: api.pairLocalEngine,
      replaceState: (url) =>
        navigate(`${url.pathname}${url.search}${url.hash}`, { replace: true }),
      setConnectionStatus: setEngineConnectionStatus,
      setEngineControlToken,
      setEngineControlUrl,
      setEngineToken,
      setEngineUrl,
    });
  }, [navigate]);
}
