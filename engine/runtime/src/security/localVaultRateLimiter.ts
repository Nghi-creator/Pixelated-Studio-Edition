import crypto from "crypto";
import type { Request, RequestHandler } from "express";

type LocalVaultRateLimitOptions = {
  globalLimit: number;
  limit: number;
  now?: () => number;
  windowMs: number;
};

type RateLimitWindow = {
  count: number;
  resetAt: number;
};

const MAX_RATE_LIMIT_KEYS = 1_024;

function getRequestIdentity(req: Request) {
  return (
    req.get("x-pixelated-access-id") ||
    req.get("x-pixelated-client-id") ||
    req.ip ||
    req.socket.remoteAddress ||
    "unknown"
  );
}

export function createLocalVaultRateLimiter({
  globalLimit,
  limit,
  now = Date.now,
  windowMs,
}: LocalVaultRateLimitOptions): RequestHandler {
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
      .update(getRequestIdentity(req))
      .digest("base64url");
    let key = identityKey;
    if (!keyedWindows.has(key) && keyedWindows.size >= MAX_RATE_LIMIT_KEYS) {
      for (const [storedKey, storedWindow] of keyedWindows) {
        if (storedWindow.resetAt <= currentTime) keyedWindows.delete(storedKey);
      }
    }
    if (!keyedWindows.has(key) && keyedWindows.size >= MAX_RATE_LIMIT_KEYS) {
      key = "overflow";
    }

    const existing = keyedWindows.get(key);
    const rateWindow =
      !existing || existing.resetAt <= currentTime
        ? { count: 0, resetAt: currentTime + windowMs }
        : existing;
    rateWindow.count += 1;
    keyedWindows.set(key, rateWindow);

    if (rateWindow.count <= limit && globalWindow.count <= globalLimit) {
      next();
      return;
    }

    const resetAt = Math.max(rateWindow.resetAt, globalWindow.resetAt);
    res.set("Cache-Control", "no-store");
    res.set(
      "Retry-After",
      String(Math.max(1, Math.ceil((resetAt - currentTime) / 1_000))),
    );
    res.status(429).json({ error: "Too many Local Vault requests" });
  };
}
