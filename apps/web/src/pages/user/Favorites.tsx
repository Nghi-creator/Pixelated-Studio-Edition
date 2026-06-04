import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { HeartCrack, Gamepad2, ArrowLeft } from "lucide-react";
import GameCard from "../../components/user/GameCard";
import { api, getAuthSession } from "../../lib/apiClient";
import { GameGridSkeleton } from "../../components/ui/Skeleton";

interface SavedGame {
  id: string;
  title: string;
  cover_url: string;
}

export default function Favorites() {
  const [favorites, setFavorites] = useState<SavedGame[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchFavoritesAndListen = async () => {
      try {
        const session = await getAuthSession();

        if (!session) {
          navigate("/login");
          return;
        }

        const data = await api.listFavorites<SavedGame>();
        setFavorites(data.favorites);

      } catch (error) {
        console.error("Error fetching favorites:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchFavoritesAndListen();
  }, [navigate]);

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col">
        <div className="mx-auto mt-20 w-full max-w-7xl px-4 sm:px-6 lg:px-8">
          <GameGridSkeleton count={10} />
        </div>
      </div>
    );
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

        {/* Empty State vs Grid */}
        {favorites.length === 0 ? (
          <div className="text-center py-32 bg-synth-surface/40 rounded-2xl border border-synth-border border-dashed shadow-inner">
            <HeartCrack className="w-16 h-16 mx-auto mb-6 text-synth-border" />
            <h3 className="text-2xl font-bold text-gray-300 mb-2">
              No favorites yet
            </h3>
            <p className="text-gray-500 mb-8 max-w-md mx-auto">
              You haven't saved any games to your library. Head back to the
              homepage to explore the catalog.
            </p>
            <button
              onClick={() => navigate("/")}
              className="bg-synth-bg hover:bg-synth-elevated border border-synth-primary/55 text-synth-primary font-bold py-3 px-8 rounded-lg transition-all flex items-center gap-2 mx-auto shadow-glow-primary-sm hover:shadow-glow-primary"
            >
              <Gamepad2 className="w-5 h-5" /> Browse Games
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
            {favorites.map((game) => (
              <GameCard
                key={game.id}
                id={game.id}
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
