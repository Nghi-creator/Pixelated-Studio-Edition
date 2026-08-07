import type { FastifyInstance } from "fastify";
import { createCatalogSocialUseCases } from "../application/catalogSocial.js";
import { getUserRole } from "../infrastructure/supabaseCatalogRepository.js";
import { rejectRateLimitedRequest } from "../../security/rateLimitResponse.js";
import { requireAuthenticatedService } from "../../security/authenticatedService.js";
import {
  deleteComment,
  findComments,
  insertComment,
} from "../infrastructure/supabaseSocialRepository.js";
import type { CatalogRouteContext } from "./catalogRouteContext.js";
import {
  commentBodySchema,
  commentParamsSchema,
  commentsQuerySchema,
  gameParamsSchema,
} from "./contracts.js";

export function registerCommentRoutes(
  app: FastifyInstance,
  context: CatalogRouteContext,
) {
  const { commentWriteLimiter, requireUser, service } = context;
  const social = service ? createCatalogSocialUseCases({
    deleteComment: (commentId, ownerId) => deleteComment(service, commentId, ownerId),
    findCommentAuthor: async () => null,
    findRole: (userId) => getUserRole(service, userId),
    hasLivePlay: async () => false,
    recordPlay: async () => {},
    saveCommentReaction: async () => null,
  }) : null;

  app.get("/games/:gameId/comments", async (request, reply) => {
    if (!service) {
      return reply.status(503).send({
        error: "Supabase service client is not configured for the API.",
      });
    }

    const params = gameParamsSchema.safeParse(request.params);
    const query = commentsQuerySchema.safeParse(request.query);
    if (!params.success || !query.success) {
      return reply.status(400).send({ error: "Invalid comments request" });
    }

    const { page, pageSize } = query.data;
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    try {
      const comments = await findComments(service, params.data.gameId, start, end);
      return {
        comments: comments.slice(0, pageSize),
        hasMore: comments.length > pageSize,
      };
    } catch (error) {
      request.log.error({ err: error }, "Failed to load comments");
      return reply.status(500).send({ error: "Failed to load comments" });
    }
  });

  app.post(
    "/games/:gameId/comments",
    { preHandler: requireUser },
    async (request, reply) => {
      const authenticated = requireAuthenticatedService(request, reply, service);
      if (!authenticated) return;
      const { service: authenticatedService, user } = authenticated;

      const params = gameParamsSchema.safeParse(request.params);
      const body = commentBodySchema.safeParse(request.body);
      if (!params.success || !body.success) {
        return reply.status(400).send({ error: "Invalid comment" });
      }
      if (
        rejectRateLimitedRequest(
          reply,
          await commentWriteLimiter.consume(user.id),
          "Comment limit reached. Please try again shortly.",
        )
      ) {
        return;
      }

      try {
        await insertComment(authenticatedService, {
          content: body.data.content,
          gameId: params.data.gameId,
          userId: user.id,
        });
        return reply.status(201).send({ success: true });
      } catch (error) {
        request.log.error({ err: error }, "Failed to post comment");
        return reply.status(500).send({ error: "Failed to post comment" });
      }
    },
  );

  app.delete(
    "/comments/:commentId",
    { preHandler: requireUser },
    async (request, reply) => {
      const authenticated = requireAuthenticatedService(request, reply, service);
      if (!authenticated) return;
      const { user } = authenticated;
      const params = commentParamsSchema.safeParse(request.params);
      if (!params.success) return reply.status(400).send({ error: "Invalid comment id" });

      try {
        await social!.deleteComment(params.data.commentId, user.id);
        return reply.status(204).send();
      } catch (error) {
        request.log.error({ err: error }, "Failed to delete comment");
        return reply.status(500).send({ error: "Failed to delete comment" });
      }
    },
  );
}
