import type { FastifyInstance } from "fastify";
import type { CatalogRouteContext } from "./catalogRouteContext.js";
import { gameParamsSchema } from "./contracts.js";
import { requireAuthenticatedService } from "../../security/authenticatedService.js";

export function registerFavoriteRoutes(
  app: FastifyInstance,
  context: CatalogRouteContext,
) {
  const { requireUser, service } = context;

  app.get("/favorites", { preHandler: requireUser }, async (request, reply) => {
    const authenticated = requireAuthenticatedService(request, reply, service);
    if (!authenticated) return;
    const { service: authenticatedService, user } = authenticated;

    const { data, error } = await authenticatedService
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
      const authenticated = requireAuthenticatedService(request, reply, service);
      if (!authenticated) return;
      const { service: authenticatedService, user } = authenticated;
      const params = gameParamsSchema.safeParse(request.params);
      if (!params.success) return reply.status(400).send({ error: "Invalid game id" });

      const { data, error } = await authenticatedService
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
      const authenticated = requireAuthenticatedService(request, reply, service);
      if (!authenticated) return;
      const { service: authenticatedService, user } = authenticated;
      const params = gameParamsSchema.safeParse(request.params);
      if (!params.success) return reply.status(400).send({ error: "Invalid game id" });

      const { error } = await authenticatedService
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
      const authenticated = requireAuthenticatedService(request, reply, service);
      if (!authenticated) return;
      const { service: authenticatedService, user } = authenticated;
      const params = gameParamsSchema.safeParse(request.params);
      if (!params.success) return reply.status(400).send({ error: "Invalid game id" });

      const { error } = await authenticatedService
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
