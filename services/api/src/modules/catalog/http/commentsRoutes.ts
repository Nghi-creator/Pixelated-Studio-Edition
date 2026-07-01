import type { FastifyInstance } from "fastify";
import { isAdminRole } from "../domain/catalogPolicy.js";
import { getUserRole } from "../services/catalogService.js";
import { rejectRateLimitedRequest } from "../../security/rateLimitResponse.js";
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
    const { data, error } = await service
      .from("comments")
      .select(
        "id,content,created_at,user_id,profiles(username,avatar_url),comment_likes(user_id,is_like)",
      )
      .eq("game_id", params.data.gameId)
      .order("created_at", { ascending: false })
      .range(start, end);
    if (error) {
      request.log.error({ err: error }, "Failed to load comments");
      return reply.status(500).send({ error: "Failed to load comments" });
    }
    return {
      comments: (data || []).slice(0, pageSize),
      hasMore: (data || []).length > pageSize,
    };
  });

  app.post(
    "/games/:gameId/comments",
    { preHandler: requireUser },
    async (request, reply) => {
      const user = request.user;
      if (!user) return reply.status(401).send({ error: "Missing authenticated user" });
      if (!service) {
        return reply.status(503).send({
          error: "Supabase service client is not configured for the API.",
        });
      }

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

      const { error } = await service.from("comments").insert({
        content: body.data.content,
        game_id: params.data.gameId,
        user_id: user.id,
      });
      if (error) {
        request.log.error({ err: error }, "Failed to post comment");
        return reply.status(500).send({ error: "Failed to post comment" });
      }
      return reply.status(201).send({ success: true });
    },
  );

  app.delete(
    "/comments/:commentId",
    { preHandler: requireUser },
    async (request, reply) => {
      const user = request.user;
      if (!user) return reply.status(401).send({ error: "Missing authenticated user" });
      if (!service) {
        return reply.status(503).send({
          error: "Supabase service client is not configured for the API.",
        });
      }
      const params = commentParamsSchema.safeParse(request.params);
      if (!params.success) return reply.status(400).send({ error: "Invalid comment id" });

      const role = await getUserRole(service, user.id);
      let query = service.from("comments").delete().eq("id", params.data.commentId);
      if (!isAdminRole(role)) query = query.eq("user_id", user.id);
      const { error } = await query;
      if (error) {
        request.log.error({ err: error }, "Failed to delete comment");
        return reply.status(500).send({ error: "Failed to delete comment" });
      }
      return reply.status(204).send();
    },
  );
}
