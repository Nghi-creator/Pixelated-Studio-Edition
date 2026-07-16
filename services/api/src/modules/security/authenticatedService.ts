import type { User } from "@supabase/supabase-js";
import type { FastifyReply, FastifyRequest } from "fastify";

export function requireAuthenticatedService<Service>(
  request: FastifyRequest,
  reply: FastifyReply,
  service: Service | null,
): { service: Service; user: User } | null {
  if (!request.user) {
    void reply.status(401).send({ error: "Missing authenticated user" });
    return null;
  }
  if (!service) {
    void reply.status(503).send({
      error: "Supabase service client is not configured for the API.",
    });
    return null;
  }
  return { service, user: request.user };
}
