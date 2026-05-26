import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  requireSupabaseUser,
  supabaseService,
} from "../modules/auth/supabaseAuth.js";

const commentParamsSchema = z.object({
  commentId: z.string().uuid(),
});

const reportBodySchema = z.object({
  reason: z.string().trim().min(1).max(1000),
});

export async function registerModerationRoutes(app: FastifyInstance) {
  app.post(
    "/moderation/comments/:commentId/report",
    { preHandler: requireSupabaseUser },
    async (request, reply) => {
      const user = request.user;
      if (!user) {
        return reply.status(401).send({ error: "Missing authenticated user" });
      }

      if (!supabaseService) {
        return reply.status(503).send({
          error: "Supabase service client is not configured for the API.",
        });
      }

      const parsedParams = commentParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.status(400).send({ error: "Invalid comment id" });
      }

      const parsedBody = reportBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.status(400).send({
          error: "Report reason is required",
        });
      }

      const { error } = await supabaseService.from("reported_comments").insert({
        comment_id: parsedParams.data.commentId,
        reporter_id: user.id,
        reason: parsedBody.data.reason,
      });

      if (error) {
        if (error.code === "23505") {
          return reply.status(409).send({
            error:
              "You have already reported this comment. Our moderators are reviewing it.",
          });
        }

        request.log.error(error, "Failed to submit comment report");
        return reply.status(500).send({ error: "Failed to submit report" });
      }

      return { success: true };
    },
  );
}
