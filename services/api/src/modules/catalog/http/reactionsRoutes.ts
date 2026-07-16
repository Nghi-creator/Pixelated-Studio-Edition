import type { FastifyInstance } from "fastify";
import { rejectRateLimitedRequest } from "../../security/rateLimitResponse.js";
import { requireAuthenticatedService } from "../../security/authenticatedService.js";
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

  app.get("/games/:gameId/reactions", async (request, reply) => {
    if (!service) {
      return reply.status(503).send({
        error: "Supabase service client is not configured for the API.",
      });
    }
    const params = gameParamsSchema.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "Invalid game id" });

    const { data, error } = await service
      .from("likes")
      .select("user_id,is_like")
      .eq("game_id", params.data.gameId);
    if (error) {
      request.log.error({ err: error }, "Failed to load reactions");
      return reply.status(500).send({ error: "Failed to load reactions" });
    }
    return { reactions: data || [] };
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

      const { error } = await authenticatedService.rpc("set_game_reaction", {
        p_game_id: params.data.gameId,
        p_is_like: body.data.isLike,
        p_user_id: user.id,
      });
      if (error) {
        request.log.error({ err: error }, "Failed to save reaction");
        return reply.status(500).send({ error: "Failed to save reaction" });
      }
      return { success: true };
    },
  );

  app.put(
    "/comments/:commentId/reaction",
    { preHandler: requireUser },
    async (request, reply) => {
      const authenticated = requireAuthenticatedService(request, reply, service);
      if (!authenticated) return;
      const { service: authenticatedService, user } = authenticated;
      const params = commentParamsSchema.safeParse(request.params);
      const body = reactionBodySchema.safeParse(request.body);
      if (!params.success || !body.success) {
        return reply.status(400).send({ error: "Invalid comment reaction" });
      }

      const { data: comment, error: commentError } = await authenticatedService
        .from("comments")
        .select("user_id")
        .eq("id", params.data.commentId)
        .maybeSingle<{ user_id: string | null }>();
      if (commentError) {
        request.log.error({ err: commentError }, "Failed to load comment");
        return reply.status(500).send({ error: "Failed to save comment reaction" });
      }
      if (!comment || comment.user_id === user.id) {
        return reply.status(403).send({ error: "Cannot react to this comment" });
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

      const { error: reactionError } = await authenticatedService.rpc("set_comment_reaction", {
        p_comment_id: params.data.commentId,
        p_is_like: body.data.isLike,
        p_user_id: user.id,
      });
      if (reactionError) {
        request.log.error({ err: reactionError }, "Failed to save comment reaction");
        return reply.status(500).send({ error: "Failed to save comment reaction" });
      }

      const { data, error: loadError } = await authenticatedService
        .from("comment_likes")
        .select("user_id,is_like")
        .eq("comment_id", params.data.commentId);
      if (loadError) {
        request.log.error({ err: loadError }, "Failed to load comment reactions");
        return reply.status(500).send({ error: "Failed to load comment reactions" });
      }
      return { reactions: data || [] };
    },
  );
}
