import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
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
  const navigate = useNavigate();

  useEffect(() => {
    void pairFromDesktopLaunchUrl(new URL(window.location.href), {
      createCompanionEngineToken,
      engineAuthHeaders,
      fetch: window.fetch.bind(window),
      pairLocalEngine: api.pairLocalEngine,
      replaceState: (url) =>
        navigate(`${url.pathname}${url.search}${url.hash}`, { replace: true }),
      setEngineControlToken,
      setEngineControlUrl,
      setEngineToken,
      setEngineUrl,
    });
  }, [navigate]);
}
