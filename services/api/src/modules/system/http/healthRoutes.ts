import type { FastifyInstance } from "fastify";
import { env, sharedRateLimitStoreConfigured } from "../../../config/env.js";

const startedAt = Date.now();

export async function registerHealthRoutes(app: FastifyInstance) {
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
    const checks = {
      supabaseUrl: Boolean(env.SUPABASE_URL),
      supabaseAnonKey: Boolean(env.SUPABASE_ANON_KEY),
      supabaseServiceRoleKey: Boolean(env.SUPABASE_SERVICE_ROLE_KEY),
      sharedRateLimitStore:
        env.NODE_ENV !== "production" || sharedRateLimitStoreConfigured,
      webOrigins: env.allowedOrigins.length > 0,
    };
    const ok = Object.values(checks).every(Boolean);

    return reply.status(ok ? 200 : 503).send({
      ok,
      service: "pixelated-api",
      environment: env.NODE_ENV,
      checks,
    });
  });
}
