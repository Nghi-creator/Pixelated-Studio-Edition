import express, {
  type Express,
  type Request,
  type RequestHandler,
  type Response,
} from "express";
import {
  createSmokeTelemetryStore,
  isTelemetryRecord,
} from "../telemetry/smokeTelemetryStore";

export { createSmokeTelemetryStore };

type SmokeTelemetryRouteOptions = {
  getActiveSessionId: () => string | null;
  requireEngineToken: RequestHandler;
};

const jsonBody = express.json({ limit: "32kb" });

export function registerSmokeTelemetryRoutes(
  app: Express,
  options: SmokeTelemetryRouteOptions,
): void {
  const { getActiveSessionId, requireEngineToken } = options;
  const store = createSmokeTelemetryStore(getActiveSessionId);

  app.put(
    "/smoke/telemetry/active",
    requireEngineToken,
    jsonBody,
    (req: Request, res: Response) => {
      const body = isTelemetryRecord(req.body) ? req.body : {};
      const captureToken =
        typeof body.captureToken === "string" ? body.captureToken : "";
      const runId = typeof body.runId === "string" ? body.runId.trim() : "";
      const sessionId =
        typeof body.sessionId === "string" ? body.sessionId.trim() : "";

      const result = store.activate(captureToken, runId, sessionId);
      if (result === "invalid") {
        res.status(400).json({ error: "Invalid smoke capture activation." });
        return;
      }
      if (result === "session-mismatch") {
        res.status(409).json({ error: "Smoke capture session is not active." });
        return;
      }

      res.status(201).json({ active: true, runId, sessionId });
    },
  );

  app.get(
    "/smoke/telemetry/active",
    requireEngineToken,
    (_req: Request, res: Response) => res.json(store.getActive()),
  );

  app.post(
    "/smoke/telemetry",
    requireEngineToken,
    jsonBody,
    (req: Request, res: Response) => {
      const snapshot = isTelemetryRecord(req.body) ? req.body : null;
      const result = snapshot
        ? store.submit(snapshot, req.get("x-pixelated-access-scope"))
        : "session-mismatch";
      if (result === "inactive") {
        res.status(404).json({ error: "No active smoke capture." });
        return;
      }
      if (result === "session-mismatch") {
        res.status(409).json({ error: "Telemetry does not match the active smoke run." });
        return;
      }
      if (result === "role-mismatch") {
        res.status(403).json({ error: "Telemetry role does not match access." });
        return;
      }

      const active = store.getActive();
      res.status(201).json({
        captured: snapshot?.playerMode,
        runId: active.active ? active.runId : null,
      });
    },
  );

  app.get("/smoke/telemetry", (req: Request, res: Response) => {
    const capture = store.read(req.get("x-smoke-capture-token") || "");
    if (!capture) {
      res.status(404).json({ error: "Smoke capture not found." });
      return;
    }
    res.json(capture);
  });

  app.delete("/smoke/telemetry/active", (req: Request, res: Response) => {
    if (!store.deactivate(req.get("x-smoke-capture-token") || "")) {
      res.status(404).json({ error: "Smoke capture not found." });
      return;
    }
    res.status(204).send();
  });
}
