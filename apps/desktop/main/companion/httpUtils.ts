import type {
  IncomingMessage,
  ServerResponse,
} from "http";

const COMPANION_REQUEST_LIMIT = 120;
const COMPANION_REQUEST_WINDOW_MS = 60 * 1000;
const COMPANION_REQUEST_MAX_ENTRIES = 1024;

const companionRequestLimits = new Map<
  string,
  { count: number; resetAt: number }
>();

export function serializeHeaderValue(value: number | string | string[] | undefined) {
  if (Array.isArray(value)) return value.join(", ");
  return value === undefined ? "" : String(value);
}

export function readJsonBody(req: IncomingMessage) {
  return new Promise<unknown>((resolve, reject) => {
    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk.toString("utf8");
      if (body.length > 1024) {
        reject(new Error("Request body is too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

export function sendJson(
  res: ServerResponse,
  statusCode: number,
  payload: Record<string, unknown>,
) {
  res.writeHead(statusCode, {
    "cache-control": "no-store",
    "content-security-policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    "content-type": "application/json",
    "referrer-policy": "no-referrer",
    "strict-transport-security": "max-age=31536000",
    "x-content-type-options": "nosniff",
  });
  res.end(JSON.stringify(payload));
}

export function consumeCompanionRequestLimit(
  key: string,
  now = Date.now(),
  limit = COMPANION_REQUEST_LIMIT,
) {
  const existing = companionRequestLimits.get(key);
  if (!existing || existing.resetAt <= now) {
    if (companionRequestLimits.size >= COMPANION_REQUEST_MAX_ENTRIES) {
      for (const [entryKey, entry] of companionRequestLimits) {
        if (entry.resetAt <= now) companionRequestLimits.delete(entryKey);
      }
    }
    while (companionRequestLimits.size >= COMPANION_REQUEST_MAX_ENTRIES) {
      const oldestKey = companionRequestLimits.keys().next().value;
      if (typeof oldestKey !== "string") break;
      companionRequestLimits.delete(oldestKey);
    }
    companionRequestLimits.set(key, {
      count: 1,
      resetAt: now + COMPANION_REQUEST_WINDOW_MS,
    });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  existing.count += 1;
  return {
    allowed: existing.count <= limit,
    retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
  };
}

export function rejectCompanionRateLimitedRequest(
  req: IncomingMessage,
  res: ServerResponse,
  scope: string,
) {
  const key = `${scope}:${req.socket.remoteAddress || "unknown"}`;
  const rateLimit = consumeCompanionRequestLimit(key);
  if (rateLimit.allowed) return false;

  res.setHeader("retry-after", rateLimit.retryAfterSeconds);
  sendJson(res, 429, {
    code: "companion_rate_limited",
    error: "Too many companion requests",
  });
  return true;
}

export function setCompanionCorsHeaders(
  req: IncomingMessage,
  res: ServerResponse,
  allowedOrigins: string[],
) {
  const origin = serializeHeaderValue(req.headers.origin);
  if (!origin || !allowedOrigins.includes(origin)) return false;

  res.setHeader(
    "access-control-allow-headers",
    "content-type, x-engine-token, x-pixelated-client-id",
  );
  res.setHeader("access-control-allow-methods", "POST, OPTIONS");
  res.setHeader("access-control-allow-origin", origin);
  if (req.headers["access-control-request-private-network"] === "true") {
    res.setHeader("access-control-allow-private-network", "true");
  }
  res.setHeader("vary", "Origin");
  return true;
}

export function getCompanionTokenFromRequest(req: IncomingMessage) {
  const headerToken = serializeHeaderValue(req.headers["x-engine-token"]);
  if (headerToken) return headerToken;

  try {
    const url = new URL(req.url || "/", "https://pixelated.local");
    return url.searchParams.get("companionToken") || "";
  } catch {
    return "";
  }
}
