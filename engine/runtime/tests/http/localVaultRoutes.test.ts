import assert from "node:assert/strict";
import test from "node:test";
import type { Request, Response } from "express";
import {
  createLocalVaultRateLimiter,
  sanitizeLocalVaultLogValue,
} from "../../src/http/localVaultRoutes";

function invokeRateLimit(
  middleware: ReturnType<typeof createLocalVaultRateLimiter>,
  clientId: string,
) {
  let nextCalled = false;
  let statusCode = 200;
  const headers = new Map<string, string>();
  let payload: unknown;
  const request = {
    get(name: string) {
      return name === "x-pixelated-client-id" ? clientId : undefined;
    },
    ip: "127.0.0.1",
    socket: { remoteAddress: "127.0.0.1" },
  } as unknown as Request;
  const response = {
    json(value: unknown) {
      payload = value;
      return this;
    },
    set(name: string, value: string) {
      headers.set(name, value);
      return this;
    },
    status(value: number) {
      statusCode = value;
      return this;
    },
  } as unknown as Response;

  middleware(request, response, () => {
    nextCalled = true;
  });
  return { headers, nextCalled, payload, statusCode };
}

test("Local Vault rate limiting bounds requests per authenticated client", () => {
  let now = 1_000;
  const middleware = createLocalVaultRateLimiter({
    globalLimit: 10,
    limit: 2,
    now: () => now,
    windowMs: 1_000,
  });

  assert.equal(invokeRateLimit(middleware, "client-a").nextCalled, true);
  assert.equal(invokeRateLimit(middleware, "client-a").nextCalled, true);
  const limited = invokeRateLimit(middleware, "client-a");
  assert.equal(limited.nextCalled, false);
  assert.equal(limited.statusCode, 429);
  assert.equal(limited.headers.get("Cache-Control"), "no-store");
  assert.equal(limited.headers.get("Retry-After"), "1");
  assert.deepEqual(limited.payload, {
    error: "Too many Local Vault requests",
  });

  now = 2_000;
  assert.equal(invokeRateLimit(middleware, "client-a").nextCalled, true);
});

test("Local Vault rate limiting has a global ceiling across rotating ids", () => {
  const middleware = createLocalVaultRateLimiter({
    globalLimit: 2,
    limit: 10,
    now: () => 1_000,
    windowMs: 60_000,
  });

  assert.equal(invokeRateLimit(middleware, "client-a").nextCalled, true);
  assert.equal(invokeRateLimit(middleware, "client-b").nextCalled, true);
  assert.equal(invokeRateLimit(middleware, "client-c").statusCode, 429);
});

test("Local Vault log values cannot inject additional log lines", () => {
  assert.equal(
    sanitizeLocalVaultLogValue("game.nes\r\n[Admin] forged"),
    "game.nes  [Admin] forged",
  );
  assert.equal(
    sanitizeLocalVaultLogValue(`game\u001b[2J.nes`),
    "game [2J.nes",
  );
});
