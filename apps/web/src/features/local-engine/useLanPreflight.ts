import { useCallback, useEffect, useState } from "react";
import type { LanPreflightState } from "./pairingTypes";
import {
  fetchLanPreflight,
  normalizeEngineUrl,
  parseEngineUrl,
} from "./pairingUtils";
import { isLikelyCompanionUrl } from "./inviteUtils";

function initialPreflightState(engineUrl: string): LanPreflightState {
  const parsedUrl = parseEngineUrl(engineUrl);
  return {
    status:
      parsedUrl && isLikelyCompanionUrl(parsedUrl) ? "checking" : "idle",
  };
}

export function useLanPreflight(engineUrl: string, enabled: boolean) {
  const [lanPreflight, setLanPreflight] = useState<LanPreflightState>(() =>
    enabled ? initialPreflightState(engineUrl) : { status: "idle" },
  );

  const retryLanPreflight = useCallback(async () => {
    const normalizedUrl = normalizeEngineUrl(engineUrl);
    setLanPreflight({ status: "checking" });
    try {
      const payload = await fetchLanPreflight(normalizedUrl);
      setLanPreflight({ payload, status: "complete" });
    } catch {
      setLanPreflight({ status: "unreachable" });
    }
  }, [engineUrl]);

  useEffect(() => {
    const parsedUrl = parseEngineUrl(engineUrl);
    if (!enabled || !parsedUrl || !isLikelyCompanionUrl(parsedUrl)) return;

    let active = true;
    const checkPreflight = () => {
      fetchLanPreflight(normalizeEngineUrl(engineUrl))
        .then((payload) => {
          if (active) setLanPreflight({ payload, status: "complete" });
        })
        .catch(() => {
          if (active) setLanPreflight({ status: "unreachable" });
        });
    };
    checkPreflight();
    const interval = window.setInterval(checkPreflight, 5_000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [enabled, engineUrl]);

  const resetLanPreflight = useCallback(
    (nextEngineUrl: string, nextEnabled: boolean) => {
      setLanPreflight(
        nextEnabled
          ? initialPreflightState(nextEngineUrl)
          : { status: "idle" },
      );
    },
    [],
  );

  return {
    lanPreflight,
    resetLanPreflight,
    retryLanPreflight,
  };
}
