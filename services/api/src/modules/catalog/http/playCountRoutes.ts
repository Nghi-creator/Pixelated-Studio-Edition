import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  requireSupabaseUser,
  supabaseService,
} from "../../auth/supabaseAuth.js";
import { rejectRateLimitedRequest } from "../../security/rateLimitResponse.js";
import { createRateLimiter } from "../../security/sharedRateLimiter.js";

const gameParamsSchema = z.object({
  gameId: z.string().uuid(),
});

type SupabaseServiceLike = NonNullable<typeof supabaseService>;

type PlayCountRouteOptions = {
  requireUser?: typeof requireSupabaseUser;
  supabase?: SupabaseServiceLike | null;
};

export async function registerPlayCountRoutes(
  app: FastifyInstance,
  options: PlayCountRouteOptions = {},
) {
  const requireUser = options.requireUser || requireSupabaseUser;
  const service = options.supabase === undefined ? supabaseService : options.supabase;
  const playCountWriteLimiter = createRateLimiter({
    limit: 60,
    namespace: "play-count-write",
    windowMs: 60_000,
  });

  app.post(
    "/games/:gameId/play-count",
    { preHandler: requireUser },
    async (request, reply) => {
      const user = request.user;
      if (!user) {
        return reply.status(401).send({ error: "Missing authenticated user" });
      }

      if (!service) {
        return reply.status(503).send({
          error: "Supabase service client is not configured for the API.",
        });
      }

      const parsedParams = gameParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.status(400).send({ error: "Invalid game id" });
      }
      if (
        rejectRateLimitedRequest(
          reply,
          await playCountWriteLimiter.consume(user.id),
          "Play-count limit reached. Please try again shortly.",
        )
      ) {
        return;
      }

      const { error } = await service.rpc("increment_play_count", {
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
