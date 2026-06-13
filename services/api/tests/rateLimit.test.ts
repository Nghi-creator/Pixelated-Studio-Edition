import assert from "node:assert/strict";
import test from "node:test";
import { FixedWindowRateLimiter } from "../src/modules/security/fixedWindowRateLimiter.js";
import { rejectRateLimitedRequest } from "../src/modules/security/rateLimitResponse.js";

test("fixed-window limiter blocks excess attempts and resets", () => {
  const limiter = new FixedWindowRateLimiter({ limit: 2, windowMs: 1_000 });

  assert.equal(limiter.consume("client", 1_000).allowed, true);
  assert.equal(limiter.consume("client", 1_001).allowed, true);
  assert.equal(limiter.consume("client", 1_002).allowed, false);
  assert.equal(limiter.consume("other", 1_002).allowed, true);
  assert.equal(limiter.consume("client", 2_000).allowed, true);
});

test("fixed-window limiter bounds unique-key memory", () => {
  const limiter = new FixedWindowRateLimiter({
    limit: 1,
    maxEntries: 2,
    windowMs: 10_000,
  });

  limiter.consume("oldest", 1_000);
  limiter.consume("middle", 1_000);
  limiter.consume("newest", 1_000);

  assert.equal(limiter.consume("oldest", 1_001).allowed, true);
  assert.equal(limiter.consume("newest", 1_001).allowed, false);
});

test("rate-limit responses include retry guidance", () => {
  const headers = new Map<string, unknown>();
  let payload: unknown;
  let statusCode = 0;
  const reply = {
    header: (name: string, value: unknown) => {
      headers.set(name, value);
      return reply;
    },
    send: (value: unknown) => {
      payload = value;
      return reply;
    },
    status: (value: number) => {
      statusCode = value;
      return reply;
    },
  };

  const rejected = rejectRateLimitedRequest(
    reply as never,
    { allowed: false, resetAt: Date.now() + 60_000 },
    "Slow down",
  );

  assert.equal(rejected, true);
  assert.equal(statusCode, 429);
  assert.equal(headers.get("Retry-After"), 60);
  assert.deepEqual(payload, { error: "Slow down" });
});
