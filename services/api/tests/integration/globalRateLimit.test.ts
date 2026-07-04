import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { registerCors } from "../../src/plugins/cors.js";
import { registerGlobalRateLimit } from "../../src/plugins/rateLimit.js";
import { registerSecurityHeaders } from "../../src/plugins/securityHeaders.js";
import type { RateLimiter } from "../../src/modules/security/sharedRateLimiter.js";

function createTestLimiter(limit: number): RateLimiter {
  const counts = new Map<string, number>();

  return {
    async consume(key) {
      const count = (counts.get(key) || 0) + 1;
      counts.set(key, count);
      return {
        allowed: count <= limit,
        remaining: Math.max(0, limit - count),
        resetAt: Date.now() + 60_000,
      };
    },
  };
}

async function createApp(limits: {
  global: number;
  health: number;
  publicRead: number;
}) {
  const app = Fastify({ trustProxy: true });
  await registerGlobalRateLimit(app, {
    globalLimiter: createTestLimiter(limits.global),
    healthLimiter: createTestLimiter(limits.health),
    publicReadLimiter: createTestLimiter(limits.publicRead),
  });
  app.get("/games", async () => ({ ok: true }));
  app.get("/health", async () => ({ ok: true }));
  app.get("/other", async () => ({ ok: true }));
  return app;
}

test("global rate limiting uses the trusted forwarded client IP", async () => {
  const app = await createApp({ global: 1, health: 10, publicRead: 10 });

  const first = await app.inject({
    headers: { "x-forwarded-for": "203.0.113.10" },
    method: "GET",
    url: "/other",
  });
  const blocked = await app.inject({
    headers: { "x-forwarded-for": "203.0.113.10" },
    method: "GET",
    url: "/other",
  });
  const otherClient = await app.inject({
    headers: { "x-forwarded-for": "203.0.113.11" },
    method: "GET",
    url: "/other",
  });

  assert.equal(first.statusCode, 200);
  assert.equal(blocked.statusCode, 429);
  assert.equal(blocked.headers["retry-after"], "60");
  assert.equal(otherClient.statusCode, 200);
  await app.close();
});

test("public catalog reads have a tighter limit than other API requests", async () => {
  const app = await createApp({ global: 10, health: 10, publicRead: 1 });
  const headers = { "x-forwarded-for": "203.0.113.20" };

  assert.equal(
    (await app.inject({ headers, method: "GET", url: "/games" })).statusCode,
    200,
  );
  const blocked = await app.inject({ headers, method: "GET", url: "/games" });
  assert.equal(blocked.statusCode, 429);
  assert.deepEqual(blocked.json(), {
    error: "Public read rate limit reached. Please try again shortly.",
  });
  assert.equal(
    (await app.inject({ headers, method: "GET", url: "/other" })).statusCode,
    200,
  );
  await app.close();
});

test("health checks use an independent limiter", async () => {
  const app = await createApp({ global: 1, health: 1, publicRead: 10 });
  const headers = { "x-forwarded-for": "203.0.113.30" };

  assert.equal(
    (await app.inject({ headers, method: "GET", url: "/other" })).statusCode,
    200,
  );
  assert.equal(
    (await app.inject({ headers, method: "GET", url: "/health" })).statusCode,
    200,
  );
  const blocked = await app.inject({ headers, method: "GET", url: "/health" });
  assert.equal(blocked.statusCode, 429);
  assert.deepEqual(blocked.json(), {
    error: "Health-check rate limit reached. Please try again shortly.",
  });
  await app.close();
});

test("malformed CORS origins are denied without crashing the API", async () => {
  const app = Fastify();
  await registerCors(app);
  app.get("/ok", async () => ({ ok: true }));

  const response = await app.inject({
    headers: { origin: "::::" },
    method: "GET",
    url: "/ok",
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["access-control-allow-origin"], undefined);
  await app.close();
});

test("security headers are attached to API responses", async () => {
  const app = Fastify();
  await registerSecurityHeaders(app);
  app.get("/ok", async () => ({ ok: true }));

  const response = await app.inject({ method: "GET", url: "/ok" });

  assert.equal(response.headers["x-content-type-options"], "nosniff");
  assert.equal(response.headers["referrer-policy"], "no-referrer");
  assert.match(
    String(response.headers["content-security-policy"]),
    /default-src 'none'/,
  );
  await app.close();
});
