import type { FastifyInstance } from "fastify";
import { createCatalogQueries } from "../application/catalogQueries.js";
import {
  fetchFeaturedGames,
  fetchPublishedCatalogFilters,
  fetchPublishedCatalogPage,
  fetchPublishedGameById,
} from "../infrastructure/supabaseCatalogRepository.js";
import { logTiming } from "../../observability/infrastructure/timing.js";
import type { CatalogRouteContext } from "./catalogRouteContext.js";
import { gameParamsSchema, gamesQuerySchema } from "./contracts.js";

function createQueries(context: CatalogRouteContext) {
  if (!context.service) return null;
  const service = context.service;
  return createCatalogQueries({
    featuredGamesCache: context.featuredGamesCache,
    fetchFeaturedGames: (timings) => fetchFeaturedGames(service, timings),
    fetchFilters: (timings) => fetchPublishedCatalogFilters(service, timings),
    fetchGameById: (gameId) => fetchPublishedGameById(service, gameId),
    fetchPage: (timings, query) =>
      fetchPublishedCatalogPage(service, timings, {
        genre: query.genre,
        license: query.license,
        offset: query.offset,
        pageSize: query.pageSize,
        platform: query.platform,
        search: query.search,
      }),
    gamesCatalogCache: context.gamesCatalogCache,
  });
}

export async function warmGamesCatalogCache(context: CatalogRouteContext) {
  return createQueries(context)?.warm() || null;
}

export function registerGamesCatalogRoutes(
  app: FastifyInstance,
  context: CatalogRouteContext,
) {
  const queries = createQueries(context);

  app.addHook("onListen", async () => {
    if (!queries) return;
    try {
      const warmup = await queries.warm();
      if (warmup) {
        logTiming(app.log, "Games catalog warmup timing", warmup.timings, {
          page: warmup.page,
          pageSize: warmup.pageSize,
        });
      }
    } catch (error) {
      app.log.warn({ err: error }, "Failed to warm games catalog cache");
    }
  });

  app.get("/games", async (request, reply) => {
    if (!queries) {
      return reply.status(503).send({
        error: "Supabase service client is not configured for the API.",
      });
    }
    const query = gamesQuerySchema.safeParse(request.query);
    if (!query.success) return reply.status(400).send({ error: "Invalid games query" });

    try {
      const result = await queries.getPage(query.data);
      if (result.featuredError) {
        request.log.warn({ err: result.featuredError }, "Failed to load featured games");
      }
      reply.header("Cache-Control", "public, max-age=30, s-maxage=60");
      reply.header("X-Pixelated-Cache", result.cache.toUpperCase());
      logTiming(request.log, "Games catalog timing", result.timings, {
        cache: result.cache,
        page: query.data.page,
        pageSize: query.data.pageSize,
        resultCount: result.response.games.length,
        search: Boolean(query.data.search),
        genre: query.data.genre || null,
        license: query.data.license || null,
        platform: query.data.platform || null,
        total: result.response.total,
      });
      return result.response;
    } catch (error) {
      request.log.error({ err: error }, "Failed to load games");
      return reply.status(500).send({ error: "Failed to load games" });
    }
  });

  app.get("/games/filters", async (request, reply) => {
    if (!queries) {
      return reply.status(503).send({
        error: "Supabase service client is not configured for the API.",
      });
    }
    try {
      const filters = await queries.getFilters({});
      reply.header("Cache-Control", "public, max-age=60, s-maxage=300");
      return filters;
    } catch (error) {
      request.log.error({ err: error }, "Failed to load catalog filters");
      return reply.status(500).send({ error: "Failed to load catalog filters" });
    }
  });

  app.get("/games/featured", async (request, reply) => {
    if (!queries) {
      return reply.status(503).send({
        error: "Supabase service client is not configured for the API.",
      });
    }
    const timings: Record<string, number> = {};
    let featuredGames: unknown[] = [];
    try {
      featuredGames = await queries.getFeaturedGames(timings);
    } catch (error) {
      request.log.warn({ err: error }, "Failed to load featured games");
    }
    reply.header("Cache-Control", "public, max-age=15, s-maxage=30");
    reply.header(
      "X-Pixelated-Cache",
      Object.hasOwn(timings, "featured_games_query_ms") ? "MISS" : "HIT",
    );
    logTiming(request.log, "Featured games timing", timings, {
      resultCount: featuredGames.length,
    });
    return { featuredGames };
  });

  app.get("/games/:gameId", async (request, reply) => {
    if (!queries) {
      return reply.status(503).send({
        error: "Supabase service client is not configured for the API.",
      });
    }
    const params = gameParamsSchema.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "Invalid game id" });
    try {
      const game = await queries.getGameById(params.data.gameId);
      return game ? { game } : reply.status(404).send({ error: "Game not found" });
    } catch (error) {
      request.log.error({ err: error }, "Failed to load game");
      return reply.status(500).send({ error: "Failed to load game" });
    }
  });
}
