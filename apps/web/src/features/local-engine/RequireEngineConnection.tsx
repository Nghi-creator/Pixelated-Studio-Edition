import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import {
  ENGINE_PAIRING_EVENT,
  hasEngineToken,
} from "../../lib/engine/engineAuth";

export function RequireEngineConnection() {
  const location = useLocation();
  const [isPaired, setIsPaired] = useState(hasEngineToken);

  useEffect(() => {
    const refreshPairing = () => setIsPaired(hasEngineToken());
    window.addEventListener(ENGINE_PAIRING_EVENT, refreshPairing);
    return () =>
      window.removeEventListener(ENGINE_PAIRING_EVENT, refreshPairing);
  }, []);

  if (!isPaired) {
    const returnTo = `${location.pathname}${location.search}`;
    return (
      <Navigate
        replace
        state={{ returnState: location.state }}
        to={`/engine?returnTo=${encodeURIComponent(returnTo)}`}
      />
    );
  }

  return <Outlet />;
}
