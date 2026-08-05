import { Loader2 } from "lucide-react";
import { Navigate, Outlet, useLocation } from "react-router";
import { useEngineConnectionStatus } from "../../hooks/engine/useEngineConnectionStatus";

export function RequireEngineConnection() {
  const location = useLocation();
  const connectionStatus = useEngineConnectionStatus();

  if (connectionStatus === "checking") {
    return (
      <div className="flex min-h-[40vh] items-center justify-center gap-3 text-sm text-gray-300">
        <Loader2 className="h-5 w-5 animate-spin text-synth-primary" />
        Checking the desktop engine connection…
      </div>
    );
  }

  if (connectionStatus !== "online") {
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
