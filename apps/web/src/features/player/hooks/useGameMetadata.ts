import { useEffect, useState } from "react";
import { api, type ApiGame } from "../../../lib/api/apiClient";

type GameRights = NonNullable<ApiGame["game_rights"]>[number];

const formatFallbackTitle = (gameId: string) =>
  gameId.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());

export function useGameMetadata(gameId: string | undefined) {
  const [gameTitle, setGameTitle] = useState("");
  const [authorName, setAuthorName] = useState<string | null>(null);
  const [gameRights, setGameRights] = useState<GameRights[]>([]);

  useEffect(() => {
    const fetchGameDetails = async () => {
      if (!gameId) return;

      try {
        const data = await api.game(gameId);
        if (data.game.title) setGameTitle(data.game.title);
        if (data.game.author_name) setAuthorName(data.game.author_name);
        setGameRights(data.game.game_rights || []);
      } catch {
        setGameTitle(formatFallbackTitle(gameId));
        setGameRights([]);
      }
    };

    fetchGameDetails();
  }, [gameId]);

  return { authorName, gameRights, gameTitle };
}
