import { Play, Plus, Check, ChevronLeft, ChevronRight } from "lucide-react";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";

interface Game {
  id: string;
  title: string;
  cover_url: string;
  backdrop_url?: string;
}

interface HeroBannerProps {
  featuredGames: Game[];
}

export default function HeroBanner({ featuredGames }: HeroBannerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFavorited, setIsFavorited] = useState(false);
  const navigate = useNavigate();

  // Automatically rotate the banner every 5 seconds
  useEffect(() => {
    if (featuredGames.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % featuredGames.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [featuredGames, currentIndex]);

  const currentGame = featuredGames[currentIndex];

  useEffect(() => {
    const checkFavoriteStatus = async () => {
      if (!currentGame) return;

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setIsFavorited(false);
        return;
      }

      const { data } = await supabase
        .from("favorites")
        .select("game_id")
        .eq("user_id", session.user.id)
        .eq("game_id", currentGame.id)
        .maybeSingle();

      setIsFavorited(!!data);
    };

    checkFavoriteStatus();
  }, [currentGame]);

  const toggleFavorite = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      alert("Please sign in to save games to your library!");
      navigate("/login");
      return;
    }

    if (isFavorited) {
      await supabase
        .from("favorites")
        .delete()
        .eq("user_id", session.user.id)
        .eq("game_id", currentGame.id);
      setIsFavorited(false);
    } else {
      await supabase
        .from("favorites")
        .insert({ user_id: session.user.id, game_id: currentGame.id });
      setIsFavorited(true);
    }
  };

  // Manual Navigation Handlers
  const handlePrev = () => {
    setCurrentIndex((prev) =>
      prev === 0 ? featuredGames.length - 1 : prev - 1,
    );
  };

  const handleNext = () => {
    setCurrentIndex((prev) => (prev + 1) % featuredGames.length);
  };

  if (!featuredGames || featuredGames.length === 0) {
    return (
      <div className="w-full h-[500px] md:h-[600px] bg-[#0B0F19] animate-pulse"></div>
    );
  }

  return (
    <div className="relative w-full h-[500px] md:h-[600px] transition-all duration-700 overflow-hidden group">
      {/* Gradients */}
      <div className="absolute inset-0 bg-gradient-to-r from-[#0B0F19] via-[#0B0F19]/60 to-transparent z-10"></div>
      <div className="absolute inset-0 bg-gradient-to-t from-[#0B0F19] via-transparent to-transparent z-10"></div>

      {/* Crossfading Images Loop */}
      {featuredGames.map((game, index) => (
        <img
          key={game.id}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ${index === currentIndex ? "opacity-80" : "opacity-0"}`}
          src={game.backdrop_url || game.cover_url}
          alt={game.title}
        />
      ))}

      {/* Navigation Arrows */}
      {featuredGames.length > 1 && (
        <>
          <button
            onClick={handlePrev}
            className="absolute left-4 top-1/2 -translate-y-1/2 z-30 p-2 bg-black/40 hover:bg-black/80 text-white rounded-full backdrop-blur-md transition-all opacity-0 group-hover:opacity-100"
          >
            <ChevronLeft className="w-8 h-8" />
          </button>
          <button
            onClick={handleNext}
            className="absolute right-4 top-1/2 -translate-y-1/2 z-30 p-2 bg-black/40 hover:bg-black/80 text-white rounded-full backdrop-blur-md transition-all opacity-0 group-hover:opacity-100"
          >
            <ChevronRight className="w-8 h-8" />
          </button>
        </>
      )}

      {/* Content */}
      <div className="absolute top-1/2 left-0 transform -translate-y-1/2 z-20 w-full">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <span className="px-3 py-1 rounded-full bg-[#00f2fe]/20 text-[#00f2fe] text-xs font-bold uppercase tracking-wide border border-[#00f2fe]/50 mb-4 inline-block">
              Trending Now
            </span>
            <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-4 drop-shadow-lg text-white">
              {currentGame.title}
            </h1>

            <div className="flex flex-wrap gap-4">
              <button
                onClick={() => navigate(`/play/${currentGame.id}`)}
                className="bg-[#00f2fe] hover:bg-blue-400 text-black font-bold py-3 px-8 rounded-lg shadow-[0_0_15px_rgba(0,242,254,0.4)] transition-all flex items-center gap-2"
              >
                <Play className="w-5 h-5 fill-black" /> Play Now
              </button>

              {/* Dynamic Add/Remove List Button */}
              <button
                onClick={toggleFavorite}
                className={`border font-bold py-3 px-8 rounded-lg transition-all flex items-center gap-2 ${
                  isFavorited
                    ? "bg-[#00f2fe]/10 border-[#00f2fe] text-[#00f2fe] hover:bg-[#00f2fe]/20"
                    : "bg-[#111827] hover:bg-gray-800 border-gray-700 text-white"
                }`}
              >
                {isFavorited ? (
                  <>
                    <Check className="w-5 h-5" /> Saved to Library
                  </>
                ) : (
                  <>
                    <Plus className="w-5 h-5" /> Add to List
                  </>
                )}
              </button>
            </div>

            {/* Little dot indicators at the bottom */}
            <div className="flex gap-2 mt-8">
              {featuredGames.map((_, idx) => (
                <div
                  key={idx}
                  onClick={() => setCurrentIndex(idx)}
                  className={`h-1.5 rounded-full cursor-pointer transition-all duration-300 ${idx === currentIndex ? "w-8 bg-[#00f2fe]" : "w-4 bg-gray-600 hover:bg-gray-400"}`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
