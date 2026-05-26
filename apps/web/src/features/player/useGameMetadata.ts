import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

const formatFallbackTitle = (gameId: string) =>
  gameId.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());

export function useGameMetadata(gameId: string | undefined) {
  const [gameTitle, setGameTitle] = useState("");
  const [authorName, setAuthorName] = useState<string | null>(null);

  useEffect(() => {
    const fetchGameDetails = async () => {
      if (!gameId) return;

      const { data } = await supabase
        .from("games")
        .select("title, author_name, rom_url")
        .eq("id", gameId)
        .single();

      if (data) {
        if (data.title) setGameTitle(data.title);
        if (data.author_name) setAuthorName(data.author_name);
      } else {
        setGameTitle(formatFallbackTitle(gameId));
      }
    };

    fetchGameDetails();
  }, [gameId]);

  return { authorName, gameTitle };
}
