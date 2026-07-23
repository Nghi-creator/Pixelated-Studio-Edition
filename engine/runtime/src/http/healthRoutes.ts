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
  getPublicHealthSnapshot?: () => HealthSnapshot;
  now?: () => number;
  publicRateLimit?: number;
  publicRateLimitWindowMs?: number;
};

type RateLimitWindow = {
  count: number;
  startedAt: number;
};

const DEFAULT_PUBLIC_HEALTH_LIMIT = 30;
const DEFAULT_PUBLIC_HEALTH_WINDOW_MS = 10_000;
const MAX_HEALTH_RATE_LIMIT_KEYS = 1_024;

export function createHealthRateLimiter(
  limit = DEFAULT_PUBLIC_HEALTH_LIMIT,
  windowMs = DEFAULT_PUBLIC_HEALTH_WINDOW_MS,
) {
  const windows = new Map<string, RateLimitWindow>();

  return function consume(key: string, now = Date.now()) {
    const current = windows.get(key);
    if (!current || now - current.startedAt >= windowMs) {
      if (!current && windows.size >= MAX_HEALTH_RATE_LIMIT_KEYS) {
        const oldestKey = windows.keys().next().value;
        if (oldestKey) windows.delete(oldestKey);
      }
      windows.set(key, { count: 1, startedAt: now });
      return { allowed: true, retryAfterSeconds: 0 };
    }

    current.count += 1;
    return {
      allowed: current.count <= limit,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((windowMs - (now - current.startedAt)) / 1_000),
      ),
    };
  };
}

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
  const consumePublicHealth = createHealthRateLimiter(
    options.publicRateLimit,
    options.publicRateLimitWindowMs,
  );
  const now = options.now || Date.now;

  app.get("/health", (req, res) => {
    const includeDetails = options.canReadDetails?.(req) === true;
    if (!includeDetails) {
      const rateLimit = consumePublicHealth(
        req.ip || req.socket.remoteAddress || "unknown",
        now(),
      );
      if (!rateLimit.allowed) {
        res.set("Retry-After", String(rateLimit.retryAfterSeconds));
        res.status(429).json({ error: "Health check rate limit reached" });
        return;
      }
    }

    const snapshot = includeDetails
      ? getHealthSnapshot()
      : options.getPublicHealthSnapshot?.() || getHealthSnapshot();
    const response = getHealthResponse(snapshot, includeDetails);
    res.status(snapshot.ok ? 200 : 503).json(response);
  });
}
