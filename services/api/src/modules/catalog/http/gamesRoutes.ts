import type { FastifyInstance } from "fastify";
import { searchAndRankGames } from "../domain/catalogSearch.js";
import { getCatalogCacheKey, getPageRange } from "../domain/catalogPolicy.js";
import {
  fetchFeaturedGames,
  fetchPublishedCatalogGames,
  fetchPublishedGameById,
} from "../services/catalogService.js";
import { logTiming } from "../../observability/timing.js";
import type { CatalogRouteContext } from "./catalogRouteContext.js";
import {
  gameParamsSchema,
  gamesQuerySchema,
  type CachedGamesCatalogResponse,
} from "./contracts.js";

const WARMUP_PAGE = 1;
const WARMUP_PAGE_SIZE = 15;

async function buildCachedGamesPage(
  service: NonNullable<CatalogRouteContext["service"]>,
  timings: Record<string, number>,
  page: number,
  pageSize: number,
  search?: string,
): Promise<CachedGamesCatalogResponse> {
  const { end, start } = getPageRange(page, pageSize);
  const data = await fetchPublishedCatalogGames(service, timings, search);
  const rankedGames = search ? searchAndRankGames(data || [], search) : data || [];
  const pagedGames = rankedGames.slice(start, end + 1);
  const total = rankedGames.length;

  return {
    games: pagedGames,
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function warmGamesCatalogCache(context: CatalogRouteContext) {
  const { gamesCatalogCache, service } = context;
  if (!service) return null;

  const cacheKey = getCatalogCacheKey(WARMUP_PAGE, WARMUP_PAGE_SIZE);
  const cachedResponse = gamesCatalogCache.get(cacheKey);
  if (cachedResponse?.featuredGames) return null;

  const timings = {};
  const [cachedPage, featuredGames] = await Promise.all([
    cachedResponse ||
      buildCachedGamesPage(service, timings, WARMUP_PAGE, WARMUP_PAGE_SIZE),
    fetchFeaturedGames(service, timings),
  ]);
  gamesCatalogCache.set(cacheKey, {
    ...cachedPage,
    featuredGames,
  });

  return {
    page: WARMUP_PAGE,
    pageSize: WARMUP_PAGE_SIZE,
    timings,
  };
}

export function registerGamesCatalogRoutes(
  app: FastifyInstance,
  context: CatalogRouteContext,
) {
  const { gamesCatalogCache, service } = context;

  app.addHook("onListen", async () => {
    if (!service) return;

    try {
      const warmup = await warmGamesCatalogCache(context);
      if (!warmup) return;
      logTiming(app.log, "Games catalog warmup timing", warmup.timings, {
        page: warmup.page,
        pageSize: warmup.pageSize,
      });
    } catch (err) {
      app.log.warn({ err }, "Failed to warm games catalog cache");
    }
  });

  app.get("/games", async (request, reply) => {
    if (!service) {
      return reply.status(503).send({
        error: "Supabase service client is not configured for the API.",
      });
    }

    const query = gamesQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.status(400).send({ error: "Invalid games query" });
    }

    const { page, pageSize, search } = query.data;
    const timings = {};
    const cacheKey = getCatalogCacheKey(page, pageSize, search);
    const cachedResponse = gamesCatalogCache.get(cacheKey);
    if (cachedResponse) {
      let featuredGames = cachedResponse.featuredGames || [];
      if (!cachedResponse.featuredGames) {
        try {
          featuredGames = await fetchFeaturedGames(service, timings);
        } catch (err) {
          request.log.warn({ err }, "Failed to load featured games");
        }
      }

      reply.header("Cache-Control", "public, max-age=30, s-maxage=60");
      reply.header("X-Pixelated-Cache", "HIT");
      logTiming(request.log, "Games catalog timing", timings, {
        cache: "hit",
        page,
        pageSize,
        resultCount: cachedResponse.games.length,
        search: Boolean(search),
        total: cachedResponse.total,
      });
      return { ...cachedResponse, featuredGames };
    }

    let cachedPage: CachedGamesCatalogResponse;
    try {
      cachedPage = await buildCachedGamesPage(
        service,
        timings,
        page,
        pageSize,
        search,
      );
    } catch (err) {
      request.log.error({ err }, "Failed to load games");
      return reply.status(500).send({ error: "Failed to load games" });
    }

    let featuredGames: unknown[] = [];
    try {
      featuredGames = await fetchFeaturedGames(service, timings);
    } catch (err) {
      request.log.warn({ err }, "Failed to load featured games");
    }

    const response = {
      featuredGames,
      ...cachedPage,
    };

    gamesCatalogCache.set(cacheKey, cachedPage);
    reply.header("Cache-Control", "public, max-age=30, s-maxage=60");
    reply.header("X-Pixelated-Cache", "MISS");
    logTiming(request.log, "Games catalog timing", timings, {
      cache: "miss",
      page,
      pageSize,
      resultCount: cachedPage.games.length,
      search: Boolean(search),
      total: cachedPage.total,
    });

    return response;
  });

  app.get("/games/featured", async (request, reply) => {
    if (!service) {
      return reply.status(503).send({
        error: "Supabase service client is not configured for the API.",
      });
    }

    const timings = {};
    let featuredGames: unknown[] = [];
    try {
      featuredGames = await fetchFeaturedGames(service, timings);
    } catch (err) {
      request.log.warn({ err }, "Failed to load featured games");
    }

    reply.header("Cache-Control", "no-store");
    logTiming(request.log, "Featured games timing", timings, {
      resultCount: featuredGames.length,
    });
    return { featuredGames };
  });

  app.get("/games/:gameId", async (request, reply) => {
    if (!service) {
      return reply.status(503).send({
        error: "Supabase service client is not configured for the API.",
      });
    }

    const params = gameParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: "Invalid game id" });
    }

    let data = null;
    try {
      data = await fetchPublishedGameById(service, params.data.gameId);
    } catch (err) {
      request.log.error({ err }, "Failed to load game");
      return reply.status(500).send({ error: "Failed to load game" });
    }
    if (!data) return reply.status(404).send({ error: "Game not found" });
    return { game: data };
  });
}
