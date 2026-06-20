import { useEffect } from "react";
import { api } from "../../lib/api/apiClient";

export function usePlayCount(gameId: string | undefined) {
  useEffect(() => {
    if (!gameId) return;

    const timer = setTimeout(async () => {
      try {
        await api.countPlay(gameId);
        console.log("Play successfully counted!");
      } catch (err) {
        console.error("Failed to count play:", err);
      }
    }, 30000);

    return () => clearTimeout(timer);
  }, [gameId]);
}
