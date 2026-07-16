import crypto from "crypto";
import express, {
  type Express,
  type Request,
  type RequestHandler,
  type Response,
} from "express";

type PlayerMode = "guest" | "host";

type SmokeTelemetrySnapshot = Record<string, unknown> & {
  playerMode: PlayerMode;
  sessionId: string;
};

type ActiveSmokeCapture = {
  captureTokenHash: string;
  runId: string;
  sessionId: string;
  telemetry: Partial<Record<PlayerMode, SmokeTelemetrySnapshot>>;
};

type SmokeTelemetryRouteOptions = {
  getActiveSessionId: () => string | null;
  requireEngineToken: RequestHandler;
};

const jsonBody = express.json({ limit: "32kb" });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const hashToken = (token: string) =>
  crypto.createHash("sha256").update(token).digest("hex");

export function createSmokeTelemetryStore(
  getActiveSessionId: () => string | null,
) {
  let activeCapture: ActiveSmokeCapture | null = null;

  return {
    activate(captureToken: string, runId: string, sessionId: string) {
      if (captureToken.length < 32 || !runId || !sessionId) return "invalid";
      if (getActiveSessionId() !== sessionId) return "session-mismatch";

      activeCapture = {
        captureTokenHash: hashToken(captureToken),
        runId,
        sessionId,
        telemetry: {},
      };
      return "activated";
    },
    deactivate(captureToken: string) {
      if (
        !activeCapture ||
        hashToken(captureToken) !== activeCapture.captureTokenHash
      ) {
        return false;
      }
      activeCapture = null;
      return true;
    },
    getActive() {
      return activeCapture
        ? {
            active: true as const,
            runId: activeCapture.runId,
            sessionId: activeCapture.sessionId,
          }
        : { active: false as const };
    },
    read(captureToken: string) {
      if (
        !activeCapture ||
        hashToken(captureToken) !== activeCapture.captureTokenHash
      ) {
        return null;
      }
      return {
        guest: activeCapture.telemetry.guest || null,
        host: activeCapture.telemetry.host || null,
        runId: activeCapture.runId,
        sessionId: activeCapture.sessionId,
      };
    },
    submit(snapshot: Record<string, unknown>) {
      if (!activeCapture) return "inactive";
      const playerMode = snapshot.playerMode;
      if (
        (playerMode !== "host" && playerMode !== "guest") ||
        snapshot.sessionId !== activeCapture.sessionId
      ) {
        return "session-mismatch";
      }
      activeCapture.telemetry[playerMode] = snapshot as SmokeTelemetrySnapshot;
      return "captured";
    },
  };
}

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
      const body = isRecord(req.body) ? req.body : {};
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
    (_req: Request, res: Response) => {
      res.json(store.getActive());
    },
  );

  app.post(
    "/smoke/telemetry",
    requireEngineToken,
    jsonBody,
    (req: Request, res: Response) => {
      const snapshot = isRecord(req.body) ? req.body : null;
      const result = snapshot ? store.submit(snapshot) : "session-mismatch";
      if (result === "inactive") {
        res.status(404).json({ error: "No active smoke capture." });
        return;
      }
      if (result === "session-mismatch") {
        res
          .status(409)
          .json({ error: "Telemetry does not match the active smoke run." });
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
