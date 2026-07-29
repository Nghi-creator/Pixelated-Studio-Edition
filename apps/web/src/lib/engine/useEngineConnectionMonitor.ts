import { useEffect } from "react";
import {
  clearEngineToken,
  engineAuthHeaders,
  ENGINE_PAIRING_EVENT,
  getEngineToken,
  hasEngineToken,
} from "./engineAuth";
import { setEngineConnectionStatus } from "./engineConnectionState";
import { engineEndpoint } from "./engineConfig";
import { shouldClearEnginePairingAfterProbe } from "./engineConnectionMonitorPolicy";

const ENGINE_PROBE_INTERVAL_MS = 5_000;
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
      clearEngineToken("rejected");
    };

    const probeEngineConnection = async () => {
      timeoutId = null;
      if (probeInFlight) {
        scheduleProbe();
        return;
      }
      const probeToken = getEngineToken();
      if (!probeToken) {
        setEngineConnectionStatus("unpaired");
        scheduleProbe();
        return;
      }

      probeInFlight = true;
      const probeUrl = engineEndpoint("/health/connection");
      const probeController = new AbortController();
      controller = probeController;
      const abortId = window.setTimeout(
        () => probeController.abort(),
        ENGINE_PROBE_TIMEOUT_MS,
      );

      try {
        const response = await fetch(probeUrl, {
          cache: "no-store",
          headers: {
            ...engineAuthHeaders(),
          },
          signal: probeController.signal,
        });

        if (disposed) return;
        if (
          getEngineToken() !== probeToken ||
          engineEndpoint("/health/connection") !== probeUrl
        ) {
          return;
        }
        if (shouldClearEnginePairingAfterProbe(response.status)) {
          markUnavailable();
          return;
        }
        setEngineConnectionStatus(response.ok ? "online" : "offline");
      } catch {
        // Runtime switches and Docker restarts can briefly drop probes.
        // Keep the saved credential, but never present it as a live connection.
        if (
          getEngineToken() === probeToken &&
          engineEndpoint("/health/connection") === probeUrl
        ) {
          setEngineConnectionStatus("offline");
        }
      } finally {
        window.clearTimeout(abortId);
        probeInFlight = false;
        if (controller === probeController) controller = null;
        if (!disposed) scheduleProbe();
      }
    };

    const handlePairingChange = () => {
      if (hasEngineToken()) setEngineConnectionStatus("checking");
      scheduleProbe(0);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") scheduleProbe(0);
    };

    window.addEventListener(ENGINE_PAIRING_EVENT, handlePairingChange);
    window.addEventListener("online", handlePairingChange);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    if (hasEngineToken()) {
      setEngineConnectionStatus("checking");
      scheduleProbe(0);
    } else {
      setEngineConnectionStatus("unpaired");
      scheduleProbe();
    }

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
