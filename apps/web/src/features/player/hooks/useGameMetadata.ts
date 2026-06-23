import { useEffect, useState } from "react";
import { api } from "../../../lib/api/apiClient";

const formatFallbackTitle = (gameId: string) =>
  gameId.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());

export function useGameMetadata(gameId: string | undefined) {
  const [gameTitle, setGameTitle] = useState("");
  const [authorName, setAuthorName] = useState<string | null>(null);

  useEffect(() => {
    const fetchGameDetails = async () => {
      if (!gameId) return;

      try {
        const data = await api.game(gameId);
        if (data.game.title) setGameTitle(data.game.title);
        if (data.game.author_name) setAuthorName(data.game.author_name);
      } catch {
        setGameTitle(formatFallbackTitle(gameId));
      }
    };

    fetchGameDetails();
  }, [gameId]);

  return { authorName, gameTitle };
}
