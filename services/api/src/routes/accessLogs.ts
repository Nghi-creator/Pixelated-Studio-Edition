import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  getBearerToken,
  supabaseAnon,
  supabaseService,
} from "../modules/auth/supabaseAuth.js";

const accessLogBodySchema = z.object({
  path: z.string().trim().min(1).max(2048),
});

export async function registerAccessLogRoutes(app: FastifyInstance) {
  app.post("/access-logs", async (request, reply) => {
    if (!supabaseService) {
      return reply.status(503).send({
        error: "Supabase service client is not configured for the API.",
      });
    }

    const parsedBody = accessLogBodySchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.status(400).send({ error: "Invalid access log" });
    }

    let userId: string | null = null;
    const token = getBearerToken(request);
    if (token && supabaseAnon) {
      const { data, error } = await supabaseAnon.auth.getUser(token);
      if (!error && data.user) {
        userId = data.user.id;
      }
    }

    const { error } = await supabaseService.from("access_logs").insert({
      path: parsedBody.data.path,
      user_id: userId,
    });

    if (error) {
      request.log.error({ err: error }, "Failed to create access log");
      return reply.status(500).send({ error: "Failed to create access log" });
    }

    return reply.status(202).send({ success: true });
  });
}
