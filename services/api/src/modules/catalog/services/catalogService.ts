import { timed, type TimingFields } from "../../observability/timing.js";
import { selectFeaturedGames } from "../domain/catalogPolicy.js";
import { attachPublishedBuilds } from "./catalogBuilds.js";
import {
  PUBLIC_CATALOG_GAME_COLUMNS,
  type CatalogGameRow,
  type CatalogService,
  type PublishedCatalogGame,
  type PublishedCatalogGameRpcRow,
} from "./catalogRows.js";

type ProfileRole = { role: string | null };

export type { CatalogGameRow, CatalogService, PublishedCatalogGame };

type SupabaseRpcError = {
  code?: string;
};

function normalizePublishedCatalogRows(
  rows: PublishedCatalogGameRpcRow[] | null | undefined,
): PublishedCatalogGame[] {
  return (rows || [])
    .map((row) => ({
      ...row,
      game_builds: Array.isArray(row.game_builds) ? row.game_builds : [],
      game_rights: Array.isArray(row.game_rights) ? row.game_rights : [],
    }))
    .filter((game) => game.game_builds.length === 1);
}

function isMissingCatalogRpc(error: unknown) {
  const code = (error as SupabaseRpcError | null | undefined)?.code;
  return code === "42883" || code === "PGRST202";
}

async function fetchPublishedCatalogGamesFromRpc(
  service: CatalogService,
  timings: TimingFields,
  options: {
    gameId?: string;
    limit: number;
    order: "play_count_desc" | "title";
    search?: string;
    timingKey: string;
  },
) {
  const rpc =
    "rpc" in service && typeof service.rpc === "function"
      ? service.rpc.bind(service)
      : null;
  if (!rpc) return null;

  const { data, error } = await timed(timings, options.timingKey, () =>
    rpc("published_catalog_games", {
      p_game_id: options.gameId || null,
      p_limit: options.limit,
      p_order: options.order,
      p_search: options.search?.trim() || null,
    }),
  );

  if (error) {
    if (isMissingCatalogRpc(error)) return null;
    throw error;
  }

  return normalizePublishedCatalogRows(data as PublishedCatalogGameRpcRow[]);
}

export async function fetchFeaturedGames(
  service: CatalogService,
  timings: TimingFields,
) {
  const { data, error } = await timed(
    timings,
    "featured_games_query_ms",
    async () => {
      const rpcGames = await fetchPublishedCatalogGamesFromRpc(
        service,
        timings,
        {
          limit: 100,
          order: "play_count_desc",
          timingKey: "featured_games_rpc_ms",
        },
      );
      if (rpcGames) return { data: rpcGames, error: null };

      const { data, error } = await service
        .from("games")
        .select(PUBLIC_CATALOG_GAME_COLUMNS)
        .eq("publication_status", "published")
        .order("play_count", { ascending: false })
        .limit(100)
        .returns<CatalogGameRow[]>();
      if (error) return { data: null, error };

      try {
        return {
          data: await attachPublishedBuilds(service, data || []),
          error: null,
        };
      } catch (err) {
        return { data: null, error: err as Error };
      }
    },
  );
  if (error) throw error;
  return selectFeaturedGames(data || []);
}

export async function fetchPublishedCatalogGames(
  service: CatalogService,
  timings: TimingFields,
  search?: string,
) {
  const { data, error } = await timed(timings, "games_query_ms", async () => {
    const rpcGames = await fetchPublishedCatalogGamesFromRpc(
      service,
      timings,
      {
        limit: search?.trim() ? 5000 : 1000,
        order: "title",
        search,
        timingKey: "games_rpc_ms",
      },
    );
    if (rpcGames) return { data: rpcGames, error: null };

    const { data: games, error: gamesError } = await service
      .from("games")
      .select(PUBLIC_CATALOG_GAME_COLUMNS)
      .eq("publication_status", "published")
      .order("title")
      .limit(1000)
      .returns<CatalogGameRow[]>();
    if (gamesError) return { data: null, error: gamesError };

    try {
      return {
        data: await attachPublishedBuilds(service, games || []),
        error: null,
      };
    } catch (err) {
      return { data: null, error: err as Error };
    }
  });

  if (error) throw error;
  return data || [];
}

export async function fetchPublishedGameById(
  service: CatalogService,
  gameId: string,
) {
  const rpcGames = await fetchPublishedCatalogGamesFromRpc(service, {}, {
    gameId,
    limit: 1,
    order: "title",
    timingKey: "game_by_id_rpc_ms",
  });
  if (rpcGames) return rpcGames[0] || null;

  const { data, error } = await service
    .from("games")
    .select(PUBLIC_CATALOG_GAME_COLUMNS)
    .eq("id", gameId)
    .eq("publication_status", "published")
    .maybeSingle<CatalogGameRow>();
  if (error) throw error;
  if (!data) return null;

  const publishedGames = await attachPublishedBuilds(service, [data]);
  return publishedGames[0] || null;
}

export async function getUserRole(
  service: CatalogService | null,
  userId: string,
) {
  if (!service) return null;
  const { data, error } = await service
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle<ProfileRole>();
  if (error) throw error;
  return data?.role || null;
}
