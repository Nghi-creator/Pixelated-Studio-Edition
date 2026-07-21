import type { Express, Request } from "express";

type HealthSnapshot = {
  [key: string]: unknown;
  engineTokenRequired?: boolean;
  exposureMode?: "lan" | "local";
  ok: boolean;
  runtimeKind?: "libretro" | "native_linux";
};

type HealthRouteOptions = {
  canReadDetails?: (request: Request) => boolean;
};

export function getHealthResponse(
  snapshot: HealthSnapshot,
  includeDetails: boolean,
) {
  return includeDetails
    ? snapshot
    : {
        engineTokenRequired: snapshot.engineTokenRequired,
        exposureMode: snapshot.exposureMode,
        ok: snapshot.ok,
        runtimeKind: snapshot.runtimeKind,
      };
}

export function registerHealthRoutes(
  app: Express,
  getHealthSnapshot: () => HealthSnapshot,
  options: HealthRouteOptions = {},
): void {
  app.get("/health", (req, res) => {
    const snapshot = getHealthSnapshot();
    const response = getHealthResponse(
      snapshot,
      options.canReadDetails?.(req) === true,
    );
    res.status(snapshot.ok ? 200 : 503).json(response);
  });
}
