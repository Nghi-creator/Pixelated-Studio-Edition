import assert from "node:assert/strict";
import test from "node:test";
import {
  createHealthRateLimiter,
  getHealthResponse,
  registerHealthRoutes,
} from "../../src/http/healthRoutes";
import type { Express, RequestHandler } from "express";

test("public health is minimal while authenticated health keeps diagnostics", () => {
  const snapshot = {
    checks: { runtime: { activeSessionId: "private-session" } },
    engineTokenRequired: true,
    exposureMode: "lan" as const,
    ok: true,
    runtimeKind: "libretro" as const,
  };

  const publicHealth = getHealthResponse(snapshot, false);
  assert.equal("checks" in publicHealth, false);
  assert.equal(publicHealth.ok, true);

  const privateHealth = getHealthResponse(snapshot, true);
  assert.deepEqual(privateHealth.checks, {
    runtime: { activeSessionId: "private-session" },
  });
});

test("public health rate limiting is bounded by client and time window", () => {
  const consume = createHealthRateLimiter(2, 1_000);

  assert.equal(consume("client-a", 1_000).allowed, true);
  assert.equal(consume("client-a", 1_100).allowed, true);
  const limited = consume("client-a", 1_200);
  assert.equal(limited.allowed, false);
  assert.equal(limited.retryAfterSeconds, 1);
  assert.equal(consume("client-b", 1_200).allowed, true);
  assert.equal(consume("client-a", 2_000).allowed, true);
});

test("connection health registers a lightweight authenticated probe", () => {
  const routes = new Map<string, RequestHandler[]>();
  const app = {
    get(path: string, ...handlers: RequestHandler[]) {
      routes.set(path, handlers);
    },
  } as unknown as Express;
  const requireEngineToken: RequestHandler = (_req, _res, next) => next();

  registerHealthRoutes(app, () => ({ ok: true }), {
    requireEngineToken,
  });

  const handlers = routes.get("/health/connection");
  assert.ok(handlers);
  assert.equal(handlers[0], requireEngineToken);

  const headers = new Map<string, string>();
  let payload: unknown;
  handlers[1](
    {} as Parameters<RequestHandler>[0],
    {
      json(value: unknown) {
        payload = value;
      },
      set(name: string, value: string) {
        headers.set(name, value);
      },
    } as Parameters<RequestHandler>[1],
    () => undefined,
  );
  assert.equal(headers.get("Cache-Control"), "no-store");
  assert.deepEqual(payload, { ok: true });
});
