import { supabaseService } from "../../auth/supabaseAuth.js";
import { timed, type TimingFields } from "../../observability/timing.js";
import { selectFeaturedGames } from "../domain/catalogPolicy.js";

type ProfileRole = { role: string | null };

export type CatalogService = NonNullable<typeof supabaseService>;

export type CatalogGameRow = {
  author_name?: string | null;
  backdrop_url?: string | null;
  cover_url?: string | null;
  developer_name?: string | null;
  developer_url?: string | null;
  id: string;
  play_count?: number | null;
  publication_status?: string | null;
  rom_filename?: string | null;
  rom_url?: string | null;
  title?: string | null;
};

export type GameBuildRow = {
  artifact_filename: string | null;
  artifact_sha256?: string | null;
  artifact_size?: number | null;
  artifact_url: string | null;
  enabled: boolean;
  game_id: string;
  id: string;
  launch_manifest_id?: string | null;
  platform_id: string;
  runtime_id: string;
  runtime_kind: "libretro" | "native_linux";
};

type GameRightsRow = {
  asset_license_spdx?: string | null;
  attribution_text?: string | null;
  code_license_spdx?: string | null;
  commercial_use_allowed?: boolean | null;
  cover_license_spdx?: string | null;
  game_build_id: string | null;
  game_id: string;
  id?: string;
  license_url?: string | null;
  modification_allowed?: boolean | null;
  original_release_url?: string | null;
  permission_evidence_url?: string | null;
  review_notes?: string | null;
  source_url?: string | null;
  verified_at: string | null;
};

export type PublishedCatalogGame = CatalogGameRow & {
  game_builds: GameBuildRow[];
  game_rights: GameRightsRow[];
};

type PublishedCatalogGameRpcRow = CatalogGameRow & {
  game_builds?: GameBuildRow[] | null;
  game_rights?: GameRightsRow[] | null;
};

type SupabaseRpcError = {
  code?: string;
};

export const PUBLIC_CATALOG_GAME_COLUMNS = [
  "id",
  "title",
  "author_name",
  "developer_name",
  "developer_url",
  "rom_url",
  "rom_filename",
  "cover_url",
  "backdrop_url",
  "play_count",
  "publication_status",
].join(",");

const ENABLED_BUILD_COLUMNS = [
  "id",
  "game_id",
  "runtime_kind",
  "runtime_id",
  "platform_id",
  "artifact_url",
  "artifact_filename",
  "artifact_size",
  "artifact_sha256",
  "launch_manifest_id",
  "enabled",
].join(",");

function rightsKey(gameId: string, buildId: string | null | undefined) {
  return `${gameId}:${buildId || "*"}`;
}

function buildIsRightsVerified(
  build: GameBuildRow,
  verifiedRights: Set<string>,
) {
  return (
    verifiedRights.has(rightsKey(build.game_id, build.id)) ||
    verifiedRights.has(rightsKey(build.game_id, null))
  );
}

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
    }),
  );

  if (error) {
    if (isMissingCatalogRpc(error)) return null;
    throw error;
  }

  return normalizePublishedCatalogRows(data as PublishedCatalogGameRpcRow[]);
}

export async function attachPublishedBuilds(
  service: CatalogService,
  games: CatalogGameRow[],
) {
  const publishedGames = games.filter(
    (game) => game.publication_status === "published",
  );
  const gameIds = publishedGames.map((game) => game.id);
  if (gameIds.length === 0) return [];

  const [{ data: builds, error: buildsError }, { data: rights, error: rightsError }] =
    await Promise.all([
      service
        .from("game_builds")
        .select(ENABLED_BUILD_COLUMNS)
        .in("game_id", gameIds)
        .eq("enabled", true)
        .returns<GameBuildRow[]>(),
      service
        .from("game_rights")
        .select(
          [
            "id",
            "game_id",
            "game_build_id",
            "code_license_spdx",
            "asset_license_spdx",
            "cover_license_spdx",
            "license_url",
            "source_url",
            "original_release_url",
            "permission_evidence_url",
            "attribution_text",
            "commercial_use_allowed",
            "modification_allowed",
            "review_notes",
            "verified_at",
          ].join(","),
        )
        .in("game_id", gameIds)
        .returns<GameRightsRow[]>(),
    ]);

  if (buildsError) throw buildsError;
  if (rightsError) throw rightsError;

  const verifiedRights = new Set(
    (rights || [])
      .filter((row) => Boolean(row.verified_at))
      .map((row) => rightsKey(row.game_id, row.game_build_id)),
  );
  const rightsByGame = new Map<string, GameRightsRow[]>();
  for (const row of rights || []) {
    if (!row.verified_at) continue;
    const gameRights = rightsByGame.get(row.game_id) || [];
    gameRights.push(row);
    rightsByGame.set(row.game_id, gameRights);
  }
  const buildsByGame = new Map<string, GameBuildRow[]>();
  for (const build of builds || []) {
    if (!buildIsRightsVerified(build, verifiedRights)) continue;
    const gameBuilds = buildsByGame.get(build.game_id) || [];
    gameBuilds.push(build);
    buildsByGame.set(build.game_id, gameBuilds);
  }

  return publishedGames
    .map((game) => ({
      ...game,
      game_builds: buildsByGame.get(game.id) || [],
      game_rights: rightsByGame.get(game.id) || [],
    }))
    .filter((game) => game.game_builds.length === 1);
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
) {
  const { data, error } = await timed(timings, "games_query_ms", async () => {
    const rpcGames = await fetchPublishedCatalogGamesFromRpc(
      service,
      timings,
      {
        limit: 1000,
        order: "title",
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
