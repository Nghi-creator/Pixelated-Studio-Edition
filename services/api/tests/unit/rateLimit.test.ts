import assert from "node:assert/strict";
import test from "node:test";
import { FixedWindowRateLimiter } from "../../src/modules/security/fixedWindowRateLimiter.js";
import { rejectRateLimitedRequest } from "../../src/modules/security/rateLimitResponse.js";
import { createRateLimiter } from "../../src/modules/security/sharedRateLimiter.js";

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

test("shared fixed-window limiters coordinate across API instances", async () => {
  const counts = new Map<string, number>();
  const requestedKeys: string[] = [];
  const redisFetch = async (_input: string | URL | Request, init?: RequestInit) => {
    const command = JSON.parse(String(init?.body)) as string[];
    const key = command[3];
    assert.equal(command[0], "EVAL");
    assert.equal(command[2], "1");
    assert.equal(command[4], "2");
    assert.equal(command[5], "1000");
    assert.ok(init?.signal);
    requestedKeys.push(key);
    const count = (counts.get(key) || 0) + 1;
    counts.set(key, count);
    return new Response(JSON.stringify({ result: [count, 1_000] }));
  };
  const options = {
    fetch: redisFetch as typeof fetch,
    limit: 2,
    namespace: "test-write",
    redisRestToken: "test-token",
    redisRestUrl: "https://redis.example.test",
    windowMs: 1_000,
  };
  const firstInstance = createRateLimiter(options);
  const secondInstance = createRateLimiter(options);

  assert.equal((await firstInstance.consume("user-1", 1_000)).allowed, true);
  assert.equal((await secondInstance.consume("user-1", 1_001)).allowed, true);
  assert.equal((await firstInstance.consume("user-1", 1_002)).allowed, false);
  assert.equal(requestedKeys.every((key) => !key.includes("user-1")), true);
});

test("shared limiter falls back to bounded local protection during Redis outages", async () => {
  const limiter = createRateLimiter({
    fetch: async () => {
      throw new Error("Redis unavailable");
    },
    limit: 1,
    namespace: "test-fallback",
    redisRestToken: "test-token",
    redisRestUrl: "https://redis.example.test",
    windowMs: 1_000,
  });

  assert.equal((await limiter.consume("client", 1_000)).allowed, true);
  assert.equal((await limiter.consume("client", 1_001)).allowed, false);
  assert.equal((await limiter.consume("client", 2_000)).allowed, true);
});

test("test runner ignores ambient Redis credentials unless explicitly injected", async () => {
  let redisRequests = 0;
  const limiter = createRateLimiter({
    fetch: async () => {
      redisRequests += 1;
      return Response.json({ result: [1, 1_000] });
    },
    limit: 1,
    namespace: "test-isolation",
    windowMs: 1_000,
  });

  assert.equal((await limiter.consume("client", 1_000)).allowed, true);
  assert.equal((await limiter.consume("client", 1_001)).allowed, false);
  assert.equal(redisRequests, 0);
});
