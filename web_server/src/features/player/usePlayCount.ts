import { useEffect } from "react";
import { supabase } from "../../lib/supabaseClient";

export function usePlayCount(gameId: string | undefined) {
  useEffect(() => {
    if (!gameId) return;

    const timer = setTimeout(async () => {
      try {
        const { error } = await supabase.rpc("increment_play_count", {
          game_id: gameId,
        });

        if (error) throw error;
        console.log("Play successfully counted!");
      } catch (err) {
        console.error("Failed to count play:", err);
      }
    }, 30000);

    return () => clearTimeout(timer);
  }, [gameId]);
}
