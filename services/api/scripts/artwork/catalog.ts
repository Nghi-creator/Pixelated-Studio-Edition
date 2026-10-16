import { isGeneratedCatalogArtworkUrl, uploadGameplayArtworkFromFile } from "../../src/modules/catalog/ingestion/infrastructure/catalogArtworkCapture.js";
import type { GameRow, BuildRow, CaptureTarget, CatalogSupabaseClient } from "./types.js";
function needsArtwork(game: GameRow) {
  return !game.cover_url || isGeneratedCatalogArtworkUrl(game.cover_url);
}
export async function loadTargets(service: CatalogSupabaseClient, options: {
  force: boolean;
  gameId: string | null;
  limit: number | null;
}) {
  let gamesQuery = service
    .from("games")
    .select("id,title,cover_url,backdrop_url,publication_status")
    .eq("publication_status", "published")
    .order("title", { ascending: true });
  if (options.gameId) {
    gamesQuery = gamesQuery.eq("id", options.gameId);
  }
  const { data: games, error: gamesError } = await gamesQuery.returns<GameRow[]>();
  if (gamesError)
    throw gamesError;
  const gameIds = (games || []).map((game) => game.id);
  if (gameIds.length === 0)
    return [];
  const { data: builds, error: buildsError } = await service
    .from("game_builds")
    .select("id,game_id,runtime_kind,runtime_id,platform_id,artifact_url,artifact_filename,artifact_sha256,enabled")
    .in("game_id", gameIds)
    .eq("enabled", true)
    .eq("runtime_kind", "libretro")
    .not("artifact_url", "is", null)
    .order("created_at", { ascending: true })
    .returns<BuildRow[]>();
  if (buildsError)
    throw buildsError;
  const buildsByGame = new Map<string, BuildRow>();
  for (const build of builds || []) {
    if (!buildsByGame.has(build.game_id))
      buildsByGame.set(build.game_id, build);
  }
  const targets = (games || [])
    .filter((game) => options.force || needsArtwork(game))
    .flatMap((game): CaptureTarget[] => {
    const build = buildsByGame.get(game.id);
    return build ? [{ build, game }] : [];
  });
  return options.limit ? targets.slice(0, options.limit) : targets;
}
export async function uploadArtwork(service: CatalogSupabaseClient, target: CaptureTarget, imagePath: string) {
  const { backdrop, cover } = await uploadGameplayArtworkFromFile(service as never, {
    build: {
      artifact_filename: target.build.artifact_filename,
      artifact_sha256: target.build.artifact_sha256,
      id: target.build.id,
    },
    game: {
      id: target.game.id,
      title: target.game.title,
    },
  }, imagePath);
  const { error: updateError } = await service
    .from("games")
    .update({
    backdrop_url: backdrop.publicUrl,
    cover_url: cover.publicUrl,
  })
    .eq("id", target.game.id);
  if (updateError)
    throw updateError;
  return {
    backdrop,
    cover,
  };
}
