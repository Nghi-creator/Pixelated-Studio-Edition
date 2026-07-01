import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api, getAuthSession } from "../../lib/api/apiClient";
import { queryKeys } from "../../lib/api/queryClient";
import { supabase } from "../../lib/auth/supabaseClient";
import {
  getFavoriteSnapshot,
  mutateFavorite,
  replaceFavoriteIds,
  resetFavoriteState,
  subscribeToFavorites,
} from "./favoriteState";

supabase.auth.onAuthStateChange(() => {
  resetFavoriteState();
});

export function useFavorite(gameId: string) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const snapshot = useSyncExternalStore(
    subscribeToFavorites,
    getFavoriteSnapshot,
    getFavoriteSnapshot,
  );
  const favoriteIdsQuery = useQuery({
    queryKey: queryKeys.favoriteIds(),
    queryFn: async () => {
      const session = await getAuthSession();
      if (!session) return new Set<string>();
      return api.favoriteIds();
    },
  });

  useEffect(() => {
    if (favoriteIdsQuery.data) {
      replaceFavoriteIds(favoriteIdsQuery.data);
    }
  }, [favoriteIdsQuery.data]);

  const toggleFavorite = useCallback(async () => {
    const session = await getAuthSession();
    if (!session) {
      navigate("/login");
      return false;
    }

    const favorited = snapshot.ids.has(gameId);
    const result = await mutateFavorite(gameId, !favorited, () =>
      favorited ? api.removeFavorite(gameId) : api.saveFavorite(gameId),
    );
    await queryClient.invalidateQueries({ queryKey: queryKeys.favoriteIds() });
    await queryClient.invalidateQueries({ queryKey: queryKeys.favorites() });
    return result;
  }, [gameId, navigate, queryClient, snapshot.ids]);

  return {
    error: snapshot.error,
    isFavorited: snapshot.ids.has(gameId),
    isPending: snapshot.pendingIds.has(gameId),
    toggleFavorite,
  };
}
