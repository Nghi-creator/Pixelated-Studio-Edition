import type { FastifyInstance, FastifyRequest } from "fastify";
import { env } from "../config/env.js";

type StudioOriginGateOptions = {
  studioOrigins?: string[];
};

function normalizeOrigin(value: string) {
  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
}

function requiresStudioOrigin(request: FastifyRequest) {
  const pathname = request.url.split("?", 1)[0] || "/";
  return (
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    (request.method === "POST" && pathname === "/submissions/games")
  );
}

export async function registerStudioOriginGate(
  app: FastifyInstance,
  options: StudioOriginGateOptions = {},
) {
  const allowedOrigins = new Set(options.studioOrigins || env.studioWebOrigins);

  app.addHook("onRequest", async (request, reply) => {
    if (!requiresStudioOrigin(request) || request.method === "OPTIONS") return;

    const origin = normalizeOrigin(request.headers.origin || "");
    if (origin && allowedOrigins.has(origin)) return;

    return reply.status(403).send({
      error: "This operation is only available from an approved Studio Edition origin.",
    });
  });
}
