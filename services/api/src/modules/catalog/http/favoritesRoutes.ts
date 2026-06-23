import type { FastifyInstance } from "fastify";
import type { CatalogRouteContext } from "./catalogRouteContext.js";
import { gameParamsSchema } from "./contracts.js";

export function registerFavoriteRoutes(
  app: FastifyInstance,
  context: CatalogRouteContext,
) {
  const { requireUser, service } = context;

  app.get("/favorites", { preHandler: requireUser }, async (request, reply) => {
    const user = request.user;
    if (!user) return reply.status(401).send({ error: "Missing authenticated user" });
    if (!service) {
      return reply.status(503).send({
        error: "Supabase service client is not configured for the API.",
      });
    }

    const { data, error } = await service
      .from("favorites")
      .select("game_id,games(id,title,cover_url)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (error) {
      request.log.error({ err: error }, "Failed to load favorites");
      return reply.status(500).send({ error: "Failed to load favorites" });
    }
    return { favorites: (data || []).map((row) => row.games).filter(Boolean) };
  });

  app.get(
    "/favorites/:gameId",
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
      if (!params.success) return reply.status(400).send({ error: "Invalid game id" });

      const { data, error } = await service
        .from("favorites")
        .select("game_id")
        .eq("user_id", user.id)
        .eq("game_id", params.data.gameId)
        .maybeSingle();
      if (error) {
        request.log.error({ err: error }, "Failed to load favorite");
        return reply.status(500).send({ error: "Failed to load favorite" });
      }
      return { favorited: Boolean(data) };
    },
  );

  app.put(
    "/favorites/:gameId",
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
      if (!params.success) return reply.status(400).send({ error: "Invalid game id" });

      const { error } = await service
        .from("favorites")
        .upsert({ game_id: params.data.gameId, user_id: user.id });
      if (error) {
        request.log.error({ err: error }, "Failed to save favorite");
        return reply.status(500).send({ error: "Failed to save favorite" });
      }
      return { favorited: true };
    },
  );

  app.delete(
    "/favorites/:gameId",
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
      if (!params.success) return reply.status(400).send({ error: "Invalid game id" });

      const { error } = await service
        .from("favorites")
        .delete()
        .eq("user_id", user.id)
        .eq("game_id", params.data.gameId);
      if (error) {
        request.log.error({ err: error }, "Failed to delete favorite");
        return reply.status(500).send({ error: "Failed to delete favorite" });
      }
      return reply.status(204).send();
    },
  );
}
