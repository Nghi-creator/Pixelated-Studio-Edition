import type { FastifyInstance } from "fastify";
import { z } from "zod";

const accountMethodsBodySchema = z.object({
  email: z.string().trim().email().max(254),
});

const undisclosedAccountMethods = {
  exists: false,
  hasEmailProvider: false,
  providers: [],
} as const;

export async function registerAuthMethodsRoutes(app: FastifyInstance) {
  app.post("/auth/account-methods", async (request, reply) => {
    if (!accountMethodsBodySchema.safeParse(request.body).success) {
      return reply.status(400).send({ error: "Invalid email address" });
    }

    return undisclosedAccountMethods;
  });
}
