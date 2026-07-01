import type { ApiGame } from "../../../lib/api/apiClient";
import { useGameMetadataQuery } from "../../../lib/api/apiQueries";

type GameRights = NonNullable<ApiGame["game_rights"]>[number];

const formatFallbackTitle = (gameId: string) =>
  gameId.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());

export function useGameMetadata(gameId: string | undefined) {
  const { data, isError } = useGameMetadataQuery(gameId);

  const game = data?.game;
  const gameTitle =
    game?.title || (isError && gameId ? formatFallbackTitle(gameId) : "");
  const authorName = game?.author_name || null;
  const gameRights = (game?.game_rights || []) as GameRights[];

  return { authorName, gameRights, gameTitle };
}
