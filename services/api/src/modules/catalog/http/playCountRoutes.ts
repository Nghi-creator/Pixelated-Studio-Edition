import type { FastifyInstance } from "fastify";
import { createRecordPlay } from "../application/catalogSocial.js";
import { z } from "zod";
import {
  requireSupabaseIdentity,
  supabaseService,
} from "../../auth/http/supabaseAuth.js";
import { rejectRateLimitedRequest } from "../../security/rateLimitResponse.js";
import { createRateLimiter } from "../../security/sharedRateLimiter.js";
import { requireAuthenticatedService } from "../../security/authenticatedService.js";
import {
  hasMatchingLiveSession,
  recordGamePlay,
} from "../infrastructure/supabaseSocialRepository.js";

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
  const hasLivePlaySession =
    options.hasLivePlaySession ||
    (async (input) => (service ? hasMatchingLiveSession(service, input) : false));
  const playCountWriteLimiter = createRateLimiter({
    limit: 60,
    namespace: "play-count-write",
    windowMs: 60_000,
  });
  const recordPlayUseCase = service ? createRecordPlay({
    hasLivePlay: hasLivePlaySession,
    recordPlay: (input) => recordGamePlay(service, input),
  }) : null;

  app.post(
    "/games/:gameId/play-count",
    { preHandler: requireUser },
    async (request, reply) => {
      const authenticated = requireAuthenticatedService(request, reply, service);
      if (!authenticated) return;
      const { user } = authenticated;

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
        const result = await recordPlayUseCase!({
          clientEdition: parsedBody.data.clientEdition,
          eventId: parsedBody.data.playEventId,
          gameId: parsedParams.data.gameId,
          runtimeKind: parsedBody.data.runtimeKind,
          userId: user.id,
        });
        if (result.status === "missing_evidence") {
          return reply.status(409).send({
            error: "A matching live game session is required to count play activity.",
          });
        }
        return { success: true };
      } catch (error) {
        request.log.error({ err: error }, "Failed to count play");
        return reply.status(500).send({ error: "Failed to count play" });
      }
    },
  );
}
