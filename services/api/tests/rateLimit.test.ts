import assert from "node:assert/strict";
import test from "node:test";
import { FixedWindowRateLimiter } from "../src/modules/security/fixedWindowRateLimiter.js";

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
