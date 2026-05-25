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
}
