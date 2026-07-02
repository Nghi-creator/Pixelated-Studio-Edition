import {
  ENABLED_BUILD_COLUMNS,
  VERIFIED_RIGHTS_COLUMNS,
  type CatalogGameRow,
  type CatalogService,
  type GameBuildRow,
  type GameRightsRow,
} from "./catalogRows.js";

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
        .select(VERIFIED_RIGHTS_COLUMNS)
        .in("game_id", gameIds)
        .returns<GameRightsRow[]>(),
    ]);

  if (buildsError) throw buildsError;
  if (rightsError) throw rightsError;

  const verifiedRights = new Set(
    (rights || [])
      .filter(
        (row) =>
          Boolean(row.verified_at) &&
          row.noncommercial_hosting_allowed === true,
      )
      .map((row) => rightsKey(row.game_id, row.game_build_id)),
  );
  const rightsByGame = new Map<string, GameRightsRow[]>();
  for (const row of rights || []) {
    if (!row.verified_at || row.noncommercial_hosting_allowed !== true) continue;
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
