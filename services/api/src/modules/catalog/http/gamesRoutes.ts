import type { FastifyInstance } from "fastify";
import { searchAndRankGames } from "../domain/catalogSearch.js";
import { getCatalogCacheKey, getPageRange } from "../domain/catalogPolicy.js";
import { fetchFeaturedGames } from "../services/catalogService.js";
import { logTiming, timed } from "../../observability/timing.js";
import type { CatalogRouteContext } from "./catalogRouteContext.js";
import { gameParamsSchema, gamesQuerySchema } from "./contracts.js";

const MAX_SEARCH_CANDIDATES = 1000;

export function registerGamesCatalogRoutes(
  app: FastifyInstance,
  context: CatalogRouteContext,
) {
  const { gamesCatalogCache, service } = context;

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
      let featuredGames: unknown[] = [];
      try {
        featuredGames = await fetchFeaturedGames(service, timings);
      } catch (err) {
        request.log.warn({ err }, "Failed to load featured games");
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

    const { end, start } = getPageRange(page, pageSize);
    let gamesQuery = service
      .from("games")
      .select("*", { count: "exact" })
      .order("title");

    if (search) {
      gamesQuery = service
        .from("games")
        .select("*")
        .order("title")
        .limit(MAX_SEARCH_CANDIDATES);
    }

    const { data, count, error } = await timed(
      timings,
      "games_query_ms",
      () => (search ? gamesQuery : gamesQuery.range(start, end)),
    );

    if (error) {
      request.log.error({ err: error }, "Failed to load games");
      return reply.status(500).send({ error: "Failed to load games" });
    }

    let featuredGames: unknown[] = [];
    try {
      featuredGames = await fetchFeaturedGames(service, timings);
    } catch (err) {
      request.log.warn({ err }, "Failed to load featured games");
    }

    const rankedGames = search
      ? searchAndRankGames(data || [], search)
      : data || [];
    const pagedGames = search ? rankedGames.slice(start, end + 1) : rankedGames;
    const total = search ? rankedGames.length : count || 0;
    const response = {
      featuredGames,
      games: pagedGames,
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };

    gamesCatalogCache.set(cacheKey, {
      games: response.games,
      page: response.page,
      pageSize: response.pageSize,
      total: response.total,
      totalPages: response.totalPages,
    });
    reply.header("Cache-Control", "public, max-age=30, s-maxage=60");
    reply.header("X-Pixelated-Cache", "MISS");
    logTiming(request.log, "Games catalog timing", timings, {
      cache: "miss",
      page,
      pageSize,
      resultCount: pagedGames.length,
      search: Boolean(search),
      total,
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

    const { data, error } = await service
      .from("games")
      .select("id,title,author_name,rom_url,rom_filename,cover_url,backdrop_url,play_count")
      .eq("id", params.data.gameId)
      .maybeSingle();

    if (error) {
      request.log.error({ err: error }, "Failed to load game");
      return reply.status(500).send({ error: "Failed to load game" });
    }
    if (!data) return reply.status(404).send({ error: "Game not found" });
    return { game: data };
  });
}
