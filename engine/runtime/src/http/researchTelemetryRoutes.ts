import type { Express, RequestHandler } from "express";

type ResearchTelemetryRouteOptions = {
  getResearchTelemetrySnapshot: (
    sessionId: string,
  ) => Record<string, unknown> | null;
  requireEngineToken: RequestHandler;
};

const MAX_SESSION_ID_LENGTH = 128;

function validSessionId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_SESSION_ID_LENGTH &&
    /^[A-Za-z0-9_-]+$/.test(value)
  );
}

export function registerResearchTelemetryRoutes(
  app: Express,
  options: ResearchTelemetryRouteOptions,
) {
  app.get(
    "/research/telemetry",
    options.requireEngineToken,
    (req, res) => {
      const sessionId = req.query.sessionId;
      if (!validSessionId(sessionId)) {
        res.status(400).json({ error: "A valid research session is required." });
        return;
      }
      const snapshot = options.getResearchTelemetrySnapshot(sessionId);
      if (!snapshot) {
        res.status(409).json({
          error: "Research telemetry session is not the active engine session.",
        });
        return;
      }
      res.set("Cache-Control", "no-store");
      res.json(snapshot);
    },
  );
}
