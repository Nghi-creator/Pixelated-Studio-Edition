import { useQuery } from "@tanstack/react-query";
import { api, type ApiGame } from "../../../lib/api/apiClient";
import { queryKeys } from "../../../lib/api/queryClient";

type GameRights = NonNullable<ApiGame["game_rights"]>[number];

const formatFallbackTitle = (gameId: string) =>
  gameId.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());

export function useGameMetadata(gameId: string | undefined) {
  const { data, isError } = useQuery({
    enabled: Boolean(gameId),
    queryKey: queryKeys.game(gameId),
    queryFn: () => api.game(gameId!),
  });

  const game = data?.game;
  const gameTitle =
    game?.title || (isError && gameId ? formatFallbackTitle(gameId) : "");
  const authorName = game?.author_name || null;
  const gameRights = (game?.game_rights || []) as GameRights[];

  return { authorName, gameRights, gameTitle };
}
