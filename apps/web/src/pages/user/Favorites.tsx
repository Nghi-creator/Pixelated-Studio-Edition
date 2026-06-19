import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import GameCard from "../../components/user/GameCard";
import { api, getAuthSession } from "../../lib/apiClient";
import { FavoritesPageSkeleton } from "../../components/ui/Skeleton";
import { replaceFavoriteIds } from "../../features/favorites/favoriteState";
import { PixelIcon } from "../../components/ui/PixelIcon";

interface SavedGame {
  id: string;
  title: string;
  cover_url: string;
}

export default function Favorites() {
  const [favorites, setFavorites] = useState<SavedGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const requestIdRef = useRef(0);
  const navigate = useNavigate();

  const fetchFavorites = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setLoadError("");
    try {
      const session = await getAuthSession();

      if (!session) {
        navigate("/login");
        return;
      }

      const data = await api.listFavorites<SavedGame>();
      if (requestId === requestIdRef.current) {
        setFavorites(data.favorites);
        replaceFavoriteIds(new Set(data.favorites.map((game) => game.id)));
      }
    } catch (error) {
      console.error("Error fetching favorites:", error);
      if (requestId === requestIdRef.current) {
        setLoadError("Could not load your library. Try again.");
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [navigate]);

  useEffect(() => {
    void fetchFavorites();
    return () => {
      requestIdRef.current += 1;
    };
  }, [fetchFavorites]);

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
              onClick={() => void fetchFavorites()}
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
                    setFavorites((current) =>
                      current.filter((favorite) => favorite.id !== game.id),
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
