import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  requireSupabaseUser,
  supabaseService,
} from "../modules/auth/supabaseAuth.js";

const gameParamsSchema = z.object({
  gameId: z.string().uuid(),
});

export async function registerGameRoutes(app: FastifyInstance) {
  app.post(
    "/games/:gameId/play-count",
    { preHandler: requireSupabaseUser },
    async (request, reply) => {
      if (!supabaseService) {
        return reply.status(503).send({
          error: "Supabase service client is not configured for the API.",
        });
      }

      const parsedParams = gameParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.status(400).send({ error: "Invalid game id" });
      }

      const { error } = await supabaseService.rpc("increment_play_count", {
        game_id: parsedParams.data.gameId,
      });

      if (error) {
        request.log.error(error, "Failed to increment play count");
        return reply.status(500).send({ error: "Failed to count play" });
      }

      return { success: true };
    },
  );
}
