import type { FastifyInstance } from "fastify";
import {
  createCatalogRouteContext,
  type CatalogRouteOptions,
} from "./catalogRouteContext.js";
import { registerCommentRoutes } from "./commentsRoutes.js";
import { registerFavoriteRoutes } from "./favoritesRoutes.js";
import { registerGamesCatalogRoutes } from "./gamesRoutes.js";
import { registerReactionRoutes } from "./reactionsRoutes.js";

export async function registerCatalogRoutes(
  app: FastifyInstance,
  options: CatalogRouteOptions = {},
) {
  const context = createCatalogRouteContext(options);
  registerGamesCatalogRoutes(app, context);
  registerFavoriteRoutes(app, context);
  registerReactionRoutes(app, context);
  registerCommentRoutes(app, context);
}
