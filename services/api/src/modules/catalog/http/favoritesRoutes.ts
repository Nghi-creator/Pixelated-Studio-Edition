import type { FastifyInstance } from "fastify";
import type { CatalogRouteContext } from "./catalogRouteContext.js";
import { gameParamsSchema } from "./contracts.js";
import { requireAuthenticatedService } from "../../security/authenticatedService.js";
import {
  deleteFavorite,
  findFavorites,
  hasFavorite,
  saveFavorite,
} from "../infrastructure/supabaseSocialRepository.js";

export function registerFavoriteRoutes(
  app: FastifyInstance,
  context: CatalogRouteContext,
) {
  const { requireUser, service } = context;

  app.get("/favorites", { preHandler: requireUser }, async (request, reply) => {
    const authenticated = requireAuthenticatedService(request, reply, service);
    if (!authenticated) return;
    const { service: authenticatedService, user } = authenticated;

    try {
      return { favorites: await findFavorites(authenticatedService, user.id) };
    } catch (error) {
      request.log.error({ err: error }, "Failed to load favorites");
      return reply.status(500).send({ error: "Failed to load favorites" });
    }
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

      try {
        return {
          favorited: await hasFavorite(authenticatedService, user.id, params.data.gameId),
        };
      } catch (error) {
        request.log.error({ err: error }, "Failed to load favorite");
        return reply.status(500).send({ error: "Failed to load favorite" });
      }
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

      try {
        await saveFavorite(authenticatedService, user.id, params.data.gameId);
        return { favorited: true };
      } catch (error) {
        request.log.error({ err: error }, "Failed to save favorite");
        return reply.status(500).send({ error: "Failed to save favorite" });
      }
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

      try {
        await deleteFavorite(authenticatedService, user.id, params.data.gameId);
        return reply.status(204).send();
      } catch (error) {
        request.log.error({ err: error }, "Failed to delete favorite");
        return reply.status(500).send({ error: "Failed to delete favorite" });
      }
    },
  );
}
