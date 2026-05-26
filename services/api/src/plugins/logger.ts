import type { FastifyServerOptions } from "fastify";
import { env } from "../config/env.js";

export function createLoggerOptions(): FastifyServerOptions["logger"] {
  return {
    level: env.NODE_ENV === "production" ? "info" : "debug",
    transport:
      env.NODE_ENV === "production"
        ? undefined
        : {
            target: "pino-pretty",
            options: {
              colorize: true,
              translateTime: "SYS:standard",
            },
          },
  };
}
