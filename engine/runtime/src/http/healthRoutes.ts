import type { Express } from "express";

type HealthSnapshot = {
  ok: boolean;
};

export function registerHealthRoutes(
  app: Express,
  getHealthSnapshot: () => HealthSnapshot,
): void {
  app.get("/health", (req, res) => {
    const snapshot = getHealthSnapshot();
    res.status(snapshot.ok ? 200 : 503).json(snapshot);
  });
}
