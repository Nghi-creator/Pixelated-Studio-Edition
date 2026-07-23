import assert from "node:assert/strict";
import test from "node:test";
import {
  createHealthRateLimiter,
  getHealthResponse,
} from "../../src/http/healthRoutes";

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
