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

      // CORS is a browser response policy, not request authentication. Returning
      // an error here bypasses later onRequest hooks and lets hostile origins
      // generate unlimited 500 responses before the global rate limiter runs.
      callback(null, false);
    },
  });
}
