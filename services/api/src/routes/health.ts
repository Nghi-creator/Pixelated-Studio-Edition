import type { FastifyInstance } from "fastify";
import { env } from "../config/env.js";

const startedAt = Date.now();

export async function registerHealthRoutes(app: FastifyInstance) {
  app.get("/health", async () => ({
    ok: true,
    service: "pixelated-api",
    environment: env.NODE_ENV,
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
  }));

  app.get("/ready", async (_request, reply) => {
    const checks = {
      supabaseUrl: Boolean(env.SUPABASE_URL),
      supabaseAnonKey: Boolean(env.SUPABASE_ANON_KEY),
      supabaseServiceRoleKey: Boolean(env.SUPABASE_SERVICE_ROLE_KEY),
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
