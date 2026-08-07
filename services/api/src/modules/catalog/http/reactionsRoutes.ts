import type { FastifyInstance } from "fastify";
import { createCatalogSocialUseCases } from "../application/catalogSocial.js";
import { rejectRateLimitedRequest } from "../../security/rateLimitResponse.js";
import { requireAuthenticatedService } from "../../security/authenticatedService.js";
import {
  findCommentAuthorId,
  findGameReactions,
  setCommentReaction,
  setGameReaction,
} from "../infrastructure/supabaseSocialRepository.js";
import type { CatalogRouteContext } from "./catalogRouteContext.js";
import {
  commentParamsSchema,
  gameParamsSchema,
  reactionBodySchema,
} from "./contracts.js";

export function registerReactionRoutes(
  app: FastifyInstance,
  context: CatalogRouteContext,
) {
  const { reactionWriteLimiter, requireUser, service } = context;
  const social = service ? createCatalogSocialUseCases({
    deleteComment: async () => {},
    findCommentAuthor: (commentId) => findCommentAuthorId(service, commentId),
    findRole: async () => null,
    hasLivePlay: async () => false,
    recordPlay: async () => {},
    saveCommentReaction: (input) => setCommentReaction(service, input),
  }) : null;

  app.get("/games/:gameId/reactions", async (request, reply) => {
    if (!service) {
      return reply.status(503).send({
        error: "Supabase service client is not configured for the API.",
      });
    }
    const params = gameParamsSchema.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "Invalid game id" });

    try {
      return { reactions: await findGameReactions(service, params.data.gameId) };
    } catch (error) {
      request.log.error({ err: error }, "Failed to load reactions");
      return reply.status(500).send({ error: "Failed to load reactions" });
    }
  });

  app.put(
    "/games/:gameId/reaction",
    { preHandler: requireUser },
    async (request, reply) => {
      const authenticated = requireAuthenticatedService(request, reply, service);
      if (!authenticated) return;
      const { service: authenticatedService, user } = authenticated;
      const params = gameParamsSchema.safeParse(request.params);
      const body = reactionBodySchema.safeParse(request.body);
      if (!params.success || !body.success) {
        return reply.status(400).send({ error: "Invalid reaction" });
      }
      if (
        rejectRateLimitedRequest(
          reply,
          await reactionWriteLimiter.consume(user.id),
          "Reaction limit reached. Please try again shortly.",
        )
      ) {
        return;
      }

      try {
        await setGameReaction(authenticatedService, {
          gameId: params.data.gameId,
          isLike: body.data.isLike,
          userId: user.id,
        });
        return { success: true };
      } catch (error) {
        request.log.error({ err: error }, "Failed to save reaction");
        return reply.status(500).send({ error: "Failed to save reaction" });
      }
    },
  );

  app.put(
    "/comments/:commentId/reaction",
    { preHandler: requireUser },
    async (request, reply) => {
      const authenticated = requireAuthenticatedService(request, reply, service);
      if (!authenticated) return;
      const { user } = authenticated;
      const params = commentParamsSchema.safeParse(request.params);
      const body = reactionBodySchema.safeParse(request.body);
      if (!params.success || !body.success) {
        return reply.status(400).send({ error: "Invalid comment reaction" });
      }

      if (
        rejectRateLimitedRequest(
          reply,
          await reactionWriteLimiter.consume(user.id),
          "Reaction limit reached. Please try again shortly.",
        )
      ) {
        return;
      }

      try {
        const result = await social!.reactToComment({
          commentId: params.data.commentId,
          isLike: body.data.isLike,
          userId: user.id,
        });
        if (result.status === "forbidden") return reply.status(403).send({ error: "Cannot react to this comment" });
        return { reactions: result.reactions };
      } catch (error) {
        request.log.error({ err: error }, "Failed to save comment reaction");
        return reply.status(500).send({ error: "Failed to save comment reaction" });
      }
    },
  );
}
