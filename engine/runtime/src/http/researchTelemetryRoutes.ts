import crypto from "crypto";
import type { Express, Request, RequestHandler } from "express";

type ResearchTelemetryRouteOptions = {
  getResearchTelemetrySnapshot: (
    sessionId: string,
  ) => Record<string, unknown> | null;
  rateLimit?: RequestHandler;
  requireEngineToken: RequestHandler;
};

const MAX_SESSION_ID_LENGTH = 128;
const DEFAULT_RESEARCH_TELEMETRY_LIMIT = 20;
const DEFAULT_RESEARCH_TELEMETRY_GLOBAL_LIMIT = 200;
const DEFAULT_RESEARCH_TELEMETRY_WINDOW_MS = 10_000;
const MAX_RESEARCH_TELEMETRY_RATE_LIMIT_KEYS = 1_024;

type RateLimitWindow = {
  count: number;
  resetAt: number;
};

function requestIdentity(req: Request) {
  return (
    req.get("x-pixelated-access-id") ||
    req.get("x-pixelated-client-id") ||
    req.ip ||
    req.socket.remoteAddress ||
    "unknown"
  );
}

export function createResearchTelemetryRateLimiter({
  globalLimit = DEFAULT_RESEARCH_TELEMETRY_GLOBAL_LIMIT,
  limit = DEFAULT_RESEARCH_TELEMETRY_LIMIT,
  now = Date.now,
  windowMs = DEFAULT_RESEARCH_TELEMETRY_WINDOW_MS,
}: {
  globalLimit?: number;
  limit?: number;
  now?: () => number;
  windowMs?: number;
} = {}): RequestHandler {
  const keyedWindows = new Map<string, RateLimitWindow>();
  let globalWindow: RateLimitWindow = { count: 0, resetAt: 0 };

  return (req, res, next) => {
    const currentTime = now();
    if (globalWindow.resetAt <= currentTime) {
      globalWindow = { count: 0, resetAt: currentTime + windowMs };
    }
    globalWindow.count += 1;

    const identityKey = crypto
      .createHash("sha256")
      .update(requestIdentity(req))
      .digest("base64url");
    let key = identityKey;
    if (!keyedWindows.has(key) && keyedWindows.size >= MAX_RESEARCH_TELEMETRY_RATE_LIMIT_KEYS) {
      for (const [storedKey, window] of keyedWindows) {
        if (window.resetAt <= currentTime) keyedWindows.delete(storedKey);
      }
    }
    if (!keyedWindows.has(key) && keyedWindows.size >= MAX_RESEARCH_TELEMETRY_RATE_LIMIT_KEYS) {
      key = "overflow";
    }

    const existing = keyedWindows.get(key);
    const window =
      !existing || existing.resetAt <= currentTime
        ? { count: 0, resetAt: currentTime + windowMs }
        : existing;
    window.count += 1;
    keyedWindows.set(key, window);

    if (window.count <= limit && globalWindow.count <= globalLimit) {
      next();
      return;
    }

    const resetAt = Math.max(window.resetAt, globalWindow.resetAt);
    res.set("Cache-Control", "no-store");
    res.set(
      "Retry-After",
      String(Math.max(1, Math.ceil((resetAt - currentTime) / 1_000))),
    );
    res.status(429).json({ error: "Research telemetry rate limit reached" });
  };
}

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
  const rateLimit = options.rateLimit || createResearchTelemetryRateLimiter();
  app.get(
    "/research/telemetry",
    options.requireEngineToken,
    rateLimit,
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
