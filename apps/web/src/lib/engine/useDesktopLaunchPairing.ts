import { useEffect } from "react";
import { api } from "../apiClient";
import { pairFromDesktopLaunchUrl } from "./desktopLaunchPairing";
import {
  createCompanionEngineToken,
  engineAuthHeaders,
  setEngineToken,
} from "./engineAuth";
import { setEngineUrl } from "./engineConfig";

export function useDesktopLaunchPairing() {
  useEffect(() => {
    void pairFromDesktopLaunchUrl(new URL(window.location.href), {
      createCompanionEngineToken,
      engineAuthHeaders,
      fetch: window.fetch.bind(window),
      pairLocalEngine: api.pairLocalEngine,
      replaceState: (url) => window.history.replaceState({}, "", url),
      setEngineToken,
      setEngineUrl,
    });
  }, []);
}
