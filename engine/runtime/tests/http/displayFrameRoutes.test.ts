import assert from "node:assert/strict";
import test from "node:test";
import { createConcurrencyLimiter } from "../../src/http/displayFrameRoutes";

test("display capture concurrency is bounded and released safely", () => {
  const limiter = createConcurrencyLimiter(2);

  assert.equal(limiter.acquire(), true);
  assert.equal(limiter.acquire(), true);
  assert.equal(limiter.acquire(), false);

  limiter.release();
  assert.equal(limiter.acquire(), true);

  limiter.release();
  limiter.release();
  limiter.release();
  assert.equal(limiter.acquire(), true);
});
