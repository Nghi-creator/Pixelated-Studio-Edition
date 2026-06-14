import { createHash } from "node:crypto";
import { env } from "../../config/env.js";
import {
  FixedWindowRateLimiter,
  type FixedWindowRateLimiterOptions,
  type RateLimitResult,
} from "./fixedWindowRateLimiter.js";

type FetchLike = typeof fetch;

type SharedRateLimiterOptions = FixedWindowRateLimiterOptions & {
  fetch?: FetchLike;
  namespace: string;
  redisRestToken?: string;
  redisRestUrl?: string;
  timeoutMs?: number;
};

type RedisResponse = {
  result?: unknown;
};

export type RateLimiter = {
  consume(key: string, now?: number): Promise<RateLimitResult>;
};

const consumeScript = `
local count = redis.call("INCR", KEYS[1])
if count == 1 then
  redis.call("PEXPIRE", KEYS[1], ARGV[2])
end
local ttl = redis.call("PTTL", KEYS[1])
return {count, ttl}
`.trim();

function redisKey(namespace: string, key: string) {
  const digest = createHash("sha256").update(key).digest("hex");
  return `pixelated:rate-limit:${namespace}:${digest}`;
}

function parseRedisResult(
  value: unknown,
  limit: number,
  now: number,
): RateLimitResult {
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    !Number.isFinite(Number(value[0])) ||
    !Number.isFinite(Number(value[1]))
  ) {
    throw new Error("Redis rate-limit response was invalid");
  }

  const count = Number(value[0]);
  const ttl = Number(value[1]);
  if (!Number.isInteger(count) || count < 1 || !Number.isInteger(ttl) || ttl < 1) {
    throw new Error("Redis rate-limit counter was invalid");
  }

  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    resetAt: now + ttl,
  };
}

export function createRateLimiter(options: SharedRateLimiterOptions): RateLimiter {
  const localLimiter = new FixedWindowRateLimiter(options);
  const useEnvironmentRedis =
    env.NODE_ENV !== "test" && !process.env.NODE_TEST_CONTEXT;
  const redisRestUrl =
    options.redisRestUrl ||
    (useEnvironmentRedis ? env.RATE_LIMIT_REDIS_REST_URL : undefined);
  const redisRestToken =
    options.redisRestToken ||
    (useEnvironmentRedis ? env.RATE_LIMIT_REDIS_REST_TOKEN : undefined);
  const fetchImpl = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? env.RATE_LIMIT_REDIS_TIMEOUT_MS;

  if (!redisRestUrl || !redisRestToken) {
    return {
      consume: async (key, now) => localLimiter.consume(key, now),
    };
  }

  return {
    async consume(key, now = Date.now()) {
      try {
        const response = await fetchImpl(redisRestUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${redisRestToken}`,
            "Content-Type": "application/json",
          },
          signal: AbortSignal.timeout(timeoutMs),
          body: JSON.stringify([
            "EVAL",
            consumeScript,
            "1",
            redisKey(options.namespace, key),
            String(options.limit),
            String(options.windowMs),
          ]),
        });
        if (!response.ok) {
          throw new Error(`Redis rate-limit request failed with ${response.status}`);
        }

        const payload = (await response.json()) as RedisResponse;
        return parseRedisResult(payload.result, options.limit, now);
      } catch {
        return localLimiter.consume(key, now);
      }
    },
  };
}
