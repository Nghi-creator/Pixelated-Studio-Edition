import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import GameCard from "../../components/user/GameCard";
import { api, getAuthSession } from "../../lib/api/apiClient";
import { queryKeys } from "../../lib/api/queryClient";
import { FavoritesPageSkeleton } from "../../components/ui/Skeleton";
import { replaceFavoriteIds } from "../../features/favorites/favoriteState";
import { PixelIcon } from "../../components/ui/PixelIcon";

interface SavedGame {
  id: string;
  title: string;
  cover_url: string;
}

export default function Favorites() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const favoritesQuery = useQuery({
    queryKey: queryKeys.favorites(),
    queryFn: async () => {
      const session = await getAuthSession();

      if (!session) {
        navigate("/login");
        return { favorites: [] as SavedGame[] };
      }

      return api.listFavorites<SavedGame>();
    },
  });
  const favorites = favoritesQuery.data?.favorites || [];
  const loading = favoritesQuery.isLoading;
  const loadError = favoritesQuery.isError
    ? "Could not load your library. Try again."
    : "";

  useEffect(() => {
    replaceFavoriteIds(new Set(favorites.map((game) => game.id)));
  }, [favorites]);

  if (loading) {
    return <FavoritesPageSkeleton />;
  }

  return (
    <div className="flex flex-col min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 w-full mt-8">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 text-gray-400 hover:text-synth-primary transition-colors mb-8 w-fit"
        >
          <ArrowLeft className="w-5 h-5" /> Back to Home
        </button>

        {/* Header */}
        <div className="mb-10">
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-4 text-white flex items-center gap-4">
            My Library
          </h1>
        </div>

        {loadError ? (
          <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-16 text-center text-red-200">
            <p>{loadError}</p>
            <button
              className="mt-4 rounded-lg border border-red-400/40 px-4 py-2 text-sm font-bold hover:bg-red-500/10"
              onClick={() => void favoritesQuery.refetch()}
              type="button"
            >
              Retry
            </button>
          </div>
        ) : favorites.length === 0 ? (
          <div className="py-32 text-center">
            <PixelIcon
              className="mx-auto mb-6 h-16 w-16 text-synth-border"
              name="favorites"
            />
            <h3 className="text-2xl font-bold text-gray-300 mb-2">
              No favorites yet
            </h3>
            <p className="text-gray-500 mb-8 max-w-md mx-auto">
              You haven't saved any games to your library. Head back to the
              homepage to explore the catalog.
            </p>
            <button
              onClick={() => navigate("/")}
              className="mx-auto flex items-center rounded-lg border border-synth-border bg-synth-bg px-8 py-3 font-bold text-white transition-colors hover:bg-synth-surface"
            >
              Browse Games
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
            {favorites.map((game) => (
              <GameCard
                key={game.id}
                id={game.id}
                onFavoriteChange={(favorited) => {
                  if (!favorited) {
                    queryClient.setQueryData<{ favorites: SavedGame[] }>(
                      queryKeys.favorites(),
                      (current) => ({
                        favorites:
                          current?.favorites.filter(
                            (favorite) => favorite.id !== game.id,
                          ) || [],
                      }),
                    );
                  }
                }}
                title={game.title}
                coverUrl={game.cover_url}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
