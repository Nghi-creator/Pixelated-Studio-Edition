import type { FastifyInstance } from "fastify";

export async function registerMeRoutes(app: FastifyInstance) {
  app.get("/me", async (_request, reply) => {
    return reply.status(501).send({
      error: "Auth is not wired yet. Implemented in Phase 4.",
    });
  });
}
