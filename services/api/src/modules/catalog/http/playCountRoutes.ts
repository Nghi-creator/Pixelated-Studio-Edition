import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  requireSupabaseIdentity,
  supabaseService,
} from "../../auth/supabaseAuth.js";
import { rejectRateLimitedRequest } from "../../security/rateLimitResponse.js";
import { createRateLimiter } from "../../security/sharedRateLimiter.js";
import { requireAuthenticatedService } from "../../security/authenticatedService.js";

const gameParamsSchema = z.object({
  gameId: z.string().uuid(),
});
const playCountBodySchema = z.object({
  clientEdition: z.enum(["studio", "user"]),
  playEventId: z.string().regex(/^[a-zA-Z0-9_-]+$/).min(16).max(100),
  runtimeKind: z.enum(["wasm", "webrtc", "native"]),
});

type SupabaseServiceLike = NonNullable<typeof supabaseService>;

type PlayCountRouteOptions = {
  hasLivePlaySession?: (input: {
    clientEdition: "studio" | "user";
    gameId: string;
    runtimeKind: "wasm" | "webrtc" | "native";
    userId: string;
  }) => Promise<boolean>;
  requireUser?: typeof requireSupabaseIdentity;
  supabase?: SupabaseServiceLike | null;
};

export async function registerPlayCountRoutes(
  app: FastifyInstance,
  options: PlayCountRouteOptions = {},
) {
  const requireUser = options.requireUser || requireSupabaseIdentity;
  const service = options.supabase === undefined ? supabaseService : options.supabase;
  const hasLivePlaySession = options.hasLivePlaySession || (async (input) => {
    if (!service) return false;
    const { data, error } = await service
      .from("backend_sessions")
      .select("id")
      .eq("user_id", input.userId)
      .eq("game_id", input.gameId)
      .eq("client_edition", input.clientEdition)
      .eq("client_runtime_kind", input.runtimeKind)
      .is("deleted_at", null)
      .gt("expires_at", new Date().toISOString())
      .limit(1)
      .maybeSingle<{ id: string }>();
    if (error) throw error;
    return Boolean(data);
  });
  const playCountWriteLimiter = createRateLimiter({
    limit: 60,
    namespace: "play-count-write",
    windowMs: 60_000,
  });

  app.post(
    "/games/:gameId/play-count",
    { preHandler: requireUser },
    async (request, reply) => {
      const authenticated = requireAuthenticatedService(request, reply, service);
      if (!authenticated) return;
      const { service: authenticatedService, user } = authenticated;

      const parsedParams = gameParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.status(400).send({ error: "Invalid game id" });
      }
      const parsedBody = playCountBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.status(400).send({ error: "Invalid play activity metadata" });
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
      try {
        const hasEvidence = await hasLivePlaySession({
          clientEdition: parsedBody.data.clientEdition,
          gameId: parsedParams.data.gameId,
          runtimeKind: parsedBody.data.runtimeKind,
          userId: user.id,
        });
        if (!hasEvidence) {
          return reply.status(409).send({
            error: "A matching live game session is required to count play activity.",
          });
        }
      } catch (error) {
        request.log.error({ err: error }, "Failed to verify play session");
        return reply.status(500).send({ error: "Failed to count play" });
      }
      const { error } = await authenticatedService.rpc("record_game_play", {
        p_client_edition: parsedBody.data.clientEdition,
        p_event_id: parsedBody.data.playEventId,
        p_game_id: parsedParams.data.gameId,
        p_runtime_kind: parsedBody.data.runtimeKind,
        p_user_id: user.id,
      });

      if (error) {
        request.log.error(error, "Failed to increment play count");
        return reply.status(500).send({ error: "Failed to count play" });
      }

      return { success: true };
    },
  );
}
