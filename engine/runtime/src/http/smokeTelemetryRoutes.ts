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
  expiresAt: number;
  runId: string;
  sessionId: string;
  telemetry: Partial<Record<PlayerMode, SmokeTelemetrySnapshot>>;
};

type SmokeTelemetryStoreOptions = {
  captureTtlMs?: number;
  now?: () => number;
};

type SmokeTelemetryRouteOptions = {
  getActiveSessionId: () => string | null;
  requireEngineToken: RequestHandler;
};

const jsonBody = express.json({ limit: "32kb" });
const DEFAULT_CAPTURE_TTL_MS = 15 * 60_000;
const MAX_CAPTURE_TOKEN_LENGTH = 256;
const MAX_IDENTIFIER_LENGTH = 128;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const hashToken = (token: string) =>
  crypto.createHash("sha256").update(token).digest("hex");

const boundedString = (value: unknown, maxLength: number) =>
  typeof value === "string" ? value.slice(0, maxLength) : null;

const finiteNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

function sanitizeSnapshot(
  snapshot: Record<string, unknown>,
  playerMode: PlayerMode,
  sessionId: string,
): SmokeTelemetrySnapshot {
  const telemetry = isRecord(snapshot.telemetry) ? snapshot.telemetry : {};
  return {
    capturedAt: boundedString(snapshot.capturedAt, 64),
    gameId: boundedString(snapshot.gameId, MAX_IDENTIFIER_LENGTH),
    playerMode,
    sessionId,
    status: boundedString(snapshot.status, MAX_IDENTIFIER_LENGTH),
    telemetry: {
      bitrateKbps: finiteNumber(telemetry.bitrateKbps),
      connectionState: boundedString(telemetry.connectionState, 32),
      fps: finiteNumber(telemetry.fps),
      iceConnectionState: boundedString(telemetry.iceConnectionState, 32),
      jitterMs: finiteNumber(telemetry.jitterMs),
      lastEngineError: boundedString(telemetry.lastEngineError, 1_000),
      lastUpdatedAt: finiteNumber(telemetry.lastUpdatedAt),
      packetsLost: finiteNumber(telemetry.packetsLost),
    },
    userAgent: boundedString(snapshot.userAgent, 512),
  };
}

export function createSmokeTelemetryStore(
  getActiveSessionId: () => string | null,
  options: SmokeTelemetryStoreOptions = {},
) {
  let activeCapture: ActiveSmokeCapture | null = null;
  const captureTtlMs = options.captureTtlMs || DEFAULT_CAPTURE_TTL_MS;
  const now = options.now || Date.now;

  const getCurrentCapture = () => {
    if (activeCapture && activeCapture.expiresAt <= now()) {
      activeCapture = null;
    }
    return activeCapture;
  };

  const tokenMatches = (captureToken: string, expectedHash: string) => {
    if (!captureToken || captureToken.length > MAX_CAPTURE_TOKEN_LENGTH) {
      return false;
    }
    return crypto.timingSafeEqual(
      Buffer.from(hashToken(captureToken), "hex"),
      Buffer.from(expectedHash, "hex"),
    );
  };

  return {
    activate(captureToken: string, runId: string, sessionId: string) {
      if (
        captureToken.length < 32 ||
        captureToken.length > MAX_CAPTURE_TOKEN_LENGTH ||
        !runId ||
        runId.length > MAX_IDENTIFIER_LENGTH ||
        !sessionId ||
        sessionId.length > MAX_IDENTIFIER_LENGTH
      ) {
        return "invalid";
      }
      if (getActiveSessionId() !== sessionId) return "session-mismatch";

      activeCapture = {
        captureTokenHash: hashToken(captureToken),
        expiresAt: now() + captureTtlMs,
        runId,
        sessionId,
        telemetry: {},
      };
      return "activated";
    },
    deactivate(captureToken: string) {
      const capture = getCurrentCapture();
      if (
        !capture ||
        !tokenMatches(captureToken, capture.captureTokenHash)
      ) {
        return false;
      }
      activeCapture = null;
      return true;
    },
    getActive() {
      const capture = getCurrentCapture();
      return capture
        ? {
            active: true as const,
            runId: capture.runId,
            sessionId: capture.sessionId,
          }
        : { active: false as const };
    },
    read(captureToken: string) {
      const capture = getCurrentCapture();
      if (
        !capture ||
        !tokenMatches(captureToken, capture.captureTokenHash)
      ) {
        return null;
      }
      return {
        guest: capture.telemetry.guest || null,
        host: capture.telemetry.host || null,
        runId: capture.runId,
        sessionId: capture.sessionId,
      };
    },
    submit(snapshot: Record<string, unknown>, accessScope?: string) {
      const capture = getCurrentCapture();
      if (!capture) return "inactive";
      const playerMode = snapshot.playerMode;
      if (
        (playerMode !== "host" && playerMode !== "guest") ||
        snapshot.sessionId !== capture.sessionId
      ) {
        return "session-mismatch";
      }
      if (
        (accessScope === "companion-host" && playerMode !== "host") ||
        (accessScope === "companion-guest" && playerMode !== "guest")
      ) {
        return "role-mismatch";
      }
      capture.telemetry[playerMode] = sanitizeSnapshot(
        snapshot,
        playerMode,
        capture.sessionId,
      );
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
      const result = snapshot
        ? store.submit(snapshot, req.get("x-pixelated-access-scope"))
        : "session-mismatch";
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
