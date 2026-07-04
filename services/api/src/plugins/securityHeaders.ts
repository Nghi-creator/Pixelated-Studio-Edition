import type { FastifyInstance } from "fastify";
import { env } from "../config/env.js";

export async function registerSecurityHeaders(app: FastifyInstance) {
  app.addHook("onRequest", async (_request, reply) => {
    reply.header("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    reply.header("Referrer-Policy", "no-referrer");
    reply.header("X-Content-Type-Options", "nosniff");
    if (env.NODE_ENV === "production") {
      reply.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
  });
}
