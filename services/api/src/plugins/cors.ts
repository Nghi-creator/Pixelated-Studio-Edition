import cors from "@fastify/cors";
import type { FastifyInstance } from "fastify";
import { env } from "../config/env.js";

export async function registerCors(app: FastifyInstance) {
  await app.register(cors, {
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    origin(origin, callback) {
      let normalizedOrigin = "";
      try {
        normalizedOrigin = origin ? new URL(origin).origin : "";
      } catch {
        callback(null, false);
        return;
      }

      if (!origin || env.allowedOrigins.includes(normalizedOrigin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`Origin not allowed by API CORS: ${origin}`), false);
    },
  });
}
