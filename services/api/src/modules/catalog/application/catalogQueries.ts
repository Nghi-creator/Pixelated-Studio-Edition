import { getCatalogCacheKey } from "../domain/catalogPolicy.js";

export type CachedGamesCatalogResponse = {
  featuredGames?: unknown[];
  games: unknown[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

type Cache<T> = { get(key: string): T | null | undefined; set(key: string, value: T): void };

export type CatalogPageQuery = {
  genre?: string;
  license?: string;
  page: number;
  pageSize: number;
  platform?: string;
  search?: string;
};

export function createCatalogQueries(dependencies: {
  featuredGamesCache: Cache<unknown[]>;
  fetchFeaturedGames(timings: Record<string, number>): Promise<unknown[]>;
  fetchFilters(timings: Record<string, number>): Promise<unknown>;
  fetchGameById(gameId: string): Promise<unknown | null>;
  fetchPage(
    timings: Record<string, number>,
    query: CatalogPageQuery & { offset: number },
  ): Promise<{ games: unknown[]; total: number }>;
  gamesCatalogCache: Cache<CachedGamesCatalogResponse>;
}) {
  async function getFeaturedGames(timings: Record<string, number>) {
    const cached = dependencies.featuredGamesCache.get("featured");
    if (cached) return cached;
    const games = await dependencies.fetchFeaturedGames(timings);
    dependencies.featuredGamesCache.set("featured", games);
    return games;
  }

  async function buildPage(query: CatalogPageQuery, timings: Record<string, number>) {
    const { games, total } = await dependencies.fetchPage(timings, {
      ...query,
      offset: (query.page - 1) * query.pageSize,
    });
    return {
      games,
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  async function getPage(query: CatalogPageQuery) {
    const timings: Record<string, number> = {};
    const cacheKey = getCatalogCacheKey(
      query.page,
      query.pageSize,
      query.search,
      query.genre,
      query.license,
      query.platform,
    );
    const cached = dependencies.gamesCatalogCache.get(cacheKey);
    let featuredError: unknown;
    if (cached) {
      let featuredGames = cached.featuredGames || [];
      if (!cached.featuredGames) {
        try {
          featuredGames = await getFeaturedGames(timings);
        } catch (error) {
          featuredError = error;
        }
      }
      return {
        cache: "hit" as const,
        featuredError,
        response: { ...cached, featuredGames },
        timings,
      };
    }

    const page = await buildPage(query, timings);
    let featuredGames: unknown[] = [];
    try {
      featuredGames = await getFeaturedGames(timings);
    } catch (error) {
      featuredError = error;
    }
    const response = { featuredGames, ...page };
    dependencies.gamesCatalogCache.set(cacheKey, response);
    return { cache: "miss" as const, featuredError, response, timings };
  }

  async function warm() {
    const query = { page: 1, pageSize: 15 };
    const cacheKey = getCatalogCacheKey(query.page, query.pageSize);
    const cached = dependencies.gamesCatalogCache.get(cacheKey);
    if (cached?.featuredGames) return null;
    const timings: Record<string, number> = {};
    const [page, featuredGames] = await Promise.all([
      cached || buildPage(query, timings),
      getFeaturedGames(timings),
    ]);
    dependencies.gamesCatalogCache.set(cacheKey, { ...page, featuredGames });
    return { page: query.page, pageSize: query.pageSize, timings };
  }

  return {
    getFeaturedGames,
    getFilters: dependencies.fetchFilters,
    getGameById: dependencies.fetchGameById,
    getPage,
    warm,
  };
}
