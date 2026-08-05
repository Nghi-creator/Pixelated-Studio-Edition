import { useEffect, useState } from "react";
import {
  ENGINE_CONNECTION_EVENT,
  getEngineConnectionStatus,
} from "../../lib/engine/engineConnectionState";

export function useEngineConnectionStatus() {
  const [status, setStatus] = useState(getEngineConnectionStatus);

  useEffect(() => {
    const refresh = () => setStatus(getEngineConnectionStatus());
    window.addEventListener(ENGINE_CONNECTION_EVENT, refresh);
    return () => window.removeEventListener(ENGINE_CONNECTION_EVENT, refresh);
  }, []);

  return status;
}
