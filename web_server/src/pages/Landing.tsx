import { useState, useEffect } from "react";
import { Search } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import HeroBanner from "../components/shared/HeroBanner";
import GameCard from "../components/shared/GameCard";

interface Game {
  id: string;
  title: string;
  cover_url: string;
  rom_filename: string;
  backdrop_url?: string;
}

export default function Landing() {
  const [games, setGames] = useState<Game[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [featuredGames, setFeaturedGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchGames();
  }, []);

  const fetchGames = async () => {
    try {
      const { data, error } = await supabase
        .from("games")
        .select("*")
        .order("title");

      if (error) throw error;

      if (data) {
        setGames(data);

        const shuffled = [...data].sort(() => 0.5 - Math.random());
        setFeaturedGames(shuffled.slice(0, 3));
      }
    } catch (error) {
      console.error("Error fetching games:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredGames = games.filter((game) =>
    game.title.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#00f2fe]"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      <HeroBanner featuredGames={featuredGames} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 w-full">
        {/* Header & Search Bar Row */}
        <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <h2 className="text-2xl font-bold border-l-4 border-[#00f2fe] pl-3">
            All Games
          </h2>

          <div className="relative w-full md:w-96">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="text-gray-400 w-4 h-4" />
            </div>
            <input
              type="text"
              placeholder="Search games..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="block w-full pl-10 pr-3 py-2 border border-gray-700 rounded-lg leading-5 bg-[#111827] text-gray-300 placeholder-gray-500 focus:outline-none focus:border-[#00f2fe] focus:ring-1 focus:ring-[#00f2fe] transition-colors"
            />
          </div>
        </div>

        {/* The Game Grid */}
        {filteredGames.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
            <Search className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p className="text-xl">No games found matching "{searchQuery}"</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
            {filteredGames.map((game) => (
              <GameCard
                key={game.id}
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
