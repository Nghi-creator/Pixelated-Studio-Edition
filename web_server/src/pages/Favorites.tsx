import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { HeartCrack, Loader2, Gamepad2, ArrowLeft } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import GameCard from "../components/shared/GameCard";

interface SavedGame {
  id: string;
  title: string;
  cover_url: string;
}

interface SupabaseJoinRow {
  games: SavedGame;
}

export default function Favorites() {
  const [favorites, setFavorites] = useState<SavedGame[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel>;

    const fetchFavoritesAndListen = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          navigate("/login");
          return;
        }

        // 1. Fetch the initial list of favorites
        const { data, error } = await supabase
          .from("favorites")
          .select(
            `
            game_id,
            games (
              id,
              title,
              cover_url
            )
          `,
          )
          .eq("user_id", session.user.id)
          .order("created_at", { ascending: false });

        if (error) throw error;

        if (data) {
          const formattedGames = (data as unknown as SupabaseJoinRow[])
            .map((row) => row.games)
            .filter((game) => game !== null);

          setFavorites(formattedGames);
        }

        // 2. Set up the Realtime Listener
        channel = supabase
          .channel("favorites-listener")
          .on(
            "postgres_changes",
            {
              event: "DELETE",
              schema: "public",
              table: "favorites",
              filter: `user_id=eq.${session.user.id}`,
            },
            (payload) => {
              setFavorites((prev) =>
                prev.filter((game) => game.id !== payload.old.game_id),
              );
            },
          )
          .subscribe();
      } catch (error) {
        console.error("Error fetching favorites:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchFavoritesAndListen();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [navigate]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <Loader2 className="w-12 h-12 text-[#00f2fe] animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 w-full mt-8">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 text-gray-400 hover:text-[#00f2fe] transition-colors mb-8 w-fit"
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
          <div className="text-center py-32 bg-[#111827]/50 rounded-2xl border border-gray-800 border-dashed">
            <HeartCrack className="w-16 h-16 mx-auto mb-6 text-gray-600" />
            <h3 className="text-2xl font-bold text-gray-300 mb-2">
              No favorites yet
            </h3>
            <p className="text-gray-500 mb-8 max-w-md mx-auto">
              You haven't saved any games to your library. Head back to the
              homepage to explore the catalog.
            </p>
            <button
              onClick={() => navigate("/")}
              className="bg-[#0B0F19] hover:bg-gray-800 border border-[#00f2fe]/50 text-[#00f2fe] font-bold py-3 px-8 rounded-lg transition-all flex items-center gap-2 mx-auto"
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
