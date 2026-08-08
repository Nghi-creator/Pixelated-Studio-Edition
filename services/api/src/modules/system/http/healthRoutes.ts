import type { FastifyInstance } from "fastify";
import { env, sharedRateLimitStoreConfigured } from "../../../config/env.js";
import { createCheckReadiness, type ReadinessConfiguration } from "../application/checkReadiness.js";
import {
  checkRateLimitStoreReadiness,
  checkSupabaseReadiness,
} from "../infrastructure/readinessChecks.js";

const startedAt = Date.now();

export type ReadinessOptions = {
  checkRateLimitStore?: () => Promise<boolean>;
  checkSupabase?: () => Promise<boolean>;
  configuration?: ReadinessConfiguration;
};

export async function registerHealthRoutes(
  app: FastifyInstance,
  options: ReadinessOptions = {},
) {
  const checkReadiness = createCheckReadiness({
    checkRateLimitStore: options.checkRateLimitStore || checkRateLimitStoreReadiness,
    checkSupabase: options.checkSupabase || checkSupabaseReadiness,
    timeoutMs: env.RATE_LIMIT_REDIS_TIMEOUT_MS,
  });
  app.get("/", async (_request, reply) =>
    reply.type("text/plain").send("API is awake!"),
  );

  app.get("/health", async () => ({
    ok: true,
    service: "pixelated-api",
    environment: env.NODE_ENV,
    rateLimitStore: sharedRateLimitStoreConfigured ? "redis" : "memory",
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
  }));

  app.get("/ready", async (_request, reply) => {
    const configuration = options.configuration || {
      sharedRateLimitStoreConfigured,
      sharedRateLimitStoreRequired: env.NODE_ENV === "production",
      supabaseConfigured: Boolean(
        env.SUPABASE_URL &&
          env.SUPABASE_ANON_KEY &&
          env.SUPABASE_SERVICE_ROLE_KEY,
      ),
      webOriginsConfigured: env.allowedOrigins.length > 0,
    };
    const { checks, ok } = await checkReadiness(configuration);

    return reply.status(ok ? 200 : 503).send({
      ok,
      service: "pixelated-api",
      environment: env.NODE_ENV,
      checks,
    });
  });
}
