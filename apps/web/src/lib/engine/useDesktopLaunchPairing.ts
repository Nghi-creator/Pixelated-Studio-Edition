import { useEffect } from "react";
import { api } from "../api/apiClient";
import { pairFromDesktopLaunchUrl } from "./desktopLaunchPairing";
import {
  createCompanionEngineToken,
  engineAuthHeaders,
  setEngineControlToken,
  setEngineToken,
} from "./engineAuth";
import { setEngineControlUrl, setEngineUrl } from "./engineConfig";

export function useDesktopLaunchPairing() {
  useEffect(() => {
    void pairFromDesktopLaunchUrl(new URL(window.location.href), {
      createCompanionEngineToken,
      engineAuthHeaders,
      fetch: window.fetch.bind(window),
      pairLocalEngine: api.pairLocalEngine,
      replaceState: (url) => window.history.replaceState({}, "", url),
      setEngineControlToken,
      setEngineControlUrl,
      setEngineToken,
      setEngineUrl,
    });
  }, []);
}
