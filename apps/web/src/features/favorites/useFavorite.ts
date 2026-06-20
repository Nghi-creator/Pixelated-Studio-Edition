import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useNavigate } from "react-router-dom";
import { api, getAuthSession } from "../../lib/api/apiClient";
import { supabase } from "../../lib/auth/supabaseClient";
import {
  ensureFavoritesLoaded,
  getFavoriteSnapshot,
  mutateFavorite,
  resetFavoriteState,
  subscribeToFavorites,
} from "./favoriteState";

supabase.auth.onAuthStateChange((_event, session) => {
  resetFavoriteState();
  if (session) {
    window.setTimeout(() => {
      void ensureFavoritesLoaded(api.favoriteIds).catch(() => undefined);
    }, 0);
  }
});

export function useFavorite(gameId: string) {
  const navigate = useNavigate();
  const snapshot = useSyncExternalStore(
    subscribeToFavorites,
    getFavoriteSnapshot,
    getFavoriteSnapshot,
  );

  useEffect(() => {
    let active = true;
    getAuthSession()
      .then((session) => {
        if (!active || !session) return;
        return ensureFavoritesLoaded(api.favoriteIds);
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, []);

  const toggleFavorite = useCallback(async () => {
    const session = await getAuthSession();
    if (!session) {
      navigate("/login");
      return false;
    }

    const favorited = snapshot.ids.has(gameId);
    return mutateFavorite(gameId, !favorited, () =>
      favorited ? api.removeFavorite(gameId) : api.saveFavorite(gameId),
    );
  }, [gameId, navigate, snapshot.ids]);

  return {
    error: snapshot.error,
    isFavorited: snapshot.ids.has(gameId),
    isPending: snapshot.pendingIds.has(gameId),
    toggleFavorite,
  };
}
