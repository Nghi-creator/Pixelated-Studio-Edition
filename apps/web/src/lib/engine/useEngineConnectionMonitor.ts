import { useEffect } from "react";
import {
  clearEngineToken,
  engineAuthHeaders,
  ENGINE_PAIRING_EVENT,
  hasEngineToken,
} from "./engineAuth";
import { engineEndpoint } from "./engineConfig";
import { shouldClearEnginePairingAfterProbe } from "./engineConnectionMonitorPolicy";

const ENGINE_PROBE_INTERVAL_MS = 2_000;
const ENGINE_PROBE_TIMEOUT_MS = 1_500;

export function useEngineConnectionMonitor() {
  useEffect(() => {
    let controller: AbortController | null = null;
    let disposed = false;
    let probeInFlight = false;
    let timeoutId: number | null = null;

    const scheduleProbe = (delay = ENGINE_PROBE_INTERVAL_MS) => {
      if (disposed) return;
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(probeEngineConnection, delay);
    };

    const markUnavailable = () => {
      if (!hasEngineToken()) return;
      clearEngineToken();
    };

    const probeEngineConnection = async () => {
      timeoutId = null;
      if (probeInFlight) {
        scheduleProbe();
        return;
      }
      if (!hasEngineToken()) {
        scheduleProbe();
        return;
      }

      probeInFlight = true;
      const probeController = new AbortController();
      controller = probeController;
      const abortId = window.setTimeout(
        () => probeController.abort(),
        ENGINE_PROBE_TIMEOUT_MS,
      );

      try {
        const response = await fetch(engineEndpoint("/local-games"), {
          cache: "no-store",
          headers: {
            "X-User-Id": "connection-monitor",
            ...engineAuthHeaders(),
          },
          signal: probeController.signal,
        });

        if (disposed) return;
        if (shouldClearEnginePairingAfterProbe(response.status)) {
          markUnavailable();
          return;
        }
      } catch {
        // Runtime switches and Docker restarts can briefly drop probes.
        // Keep the saved pairing unless the engine explicitly rejects it.
      } finally {
        window.clearTimeout(abortId);
        probeInFlight = false;
        if (controller === probeController) controller = null;
        if (!disposed) scheduleProbe();
      }
    };

    const handlePairingChange = () => {
      scheduleProbe(0);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") scheduleProbe(0);
    };

    window.addEventListener(ENGINE_PAIRING_EVENT, handlePairingChange);
    window.addEventListener("online", handlePairingChange);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    scheduleProbe(0);

    return () => {
      disposed = true;
      controller?.abort();
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      window.removeEventListener(ENGINE_PAIRING_EVENT, handlePairingChange);
      window.removeEventListener("online", handlePairingChange);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);
}
