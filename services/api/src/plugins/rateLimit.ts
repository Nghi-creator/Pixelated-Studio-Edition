import type { FastifyInstance } from "fastify";
import { env } from "../config/env.js";
import {
  createRateLimiter,
  type RateLimiter,
} from "../modules/security/sharedRateLimiter.js";
import { rejectRateLimitedRequest } from "../modules/security/rateLimitResponse.js";

const RATE_LIMIT_WINDOW_MS = 60_000;

type GlobalRateLimitOptions = {
  globalLimiter?: RateLimiter;
  healthLimiter?: RateLimiter;
  publicReadLimiter?: RateLimiter;
};

function getPathname(url: string) {
  return url.split("?", 1)[0] || "/";
}

function isHealthPath(pathname: string) {
  return pathname === "/" || pathname === "/health" || pathname === "/ready";
}

function isPublicCatalogRead(method: string, pathname: string) {
  return (method === "GET" || method === "HEAD") &&
    (pathname === "/games" || pathname.startsWith("/games/"));
}

export async function registerGlobalRateLimit(
  app: FastifyInstance,
  options: GlobalRateLimitOptions = {},
) {
  const globalLimiter = options.globalLimiter || createRateLimiter({
    limit: env.GLOBAL_RATE_LIMIT_PER_MINUTE,
    namespace: "global-ip",
    windowMs: RATE_LIMIT_WINDOW_MS,
  });
  const healthLimiter = options.healthLimiter || createRateLimiter({
    limit: env.HEALTH_RATE_LIMIT_PER_MINUTE,
    namespace: "health-ip",
    windowMs: RATE_LIMIT_WINDOW_MS,
  });
  const publicReadLimiter = options.publicReadLimiter || createRateLimiter({
    limit: env.PUBLIC_READ_RATE_LIMIT_PER_MINUTE,
    namespace: "public-read-ip",
    windowMs: RATE_LIMIT_WINDOW_MS,
  });

  app.addHook("onRequest", async (request, reply) => {
    const pathname = getPathname(request.url);
    const clientIp = request.ip;

    if (isHealthPath(pathname)) {
      rejectRateLimitedRequest(
        reply,
        await healthLimiter.consume(clientIp),
        "Health-check rate limit reached. Please try again shortly.",
      );
      return;
    }

    if (
      rejectRateLimitedRequest(
        reply,
        await globalLimiter.consume(clientIp),
        "API rate limit reached. Please try again shortly.",
      )
    ) {
      return;
    }

    if (isPublicCatalogRead(request.method, pathname)) {
      rejectRateLimitedRequest(
        reply,
        await publicReadLimiter.consume(clientIp),
        "Public read rate limit reached. Please try again shortly.",
      );
    }
  });
}
