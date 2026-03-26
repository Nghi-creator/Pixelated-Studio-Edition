import { Play, Plus } from "lucide-react";
import { useState, useEffect } from "react";

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

  // Automatically rotate the banner every 5 seconds
  useEffect(() => {
    if (featuredGames.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % featuredGames.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [featuredGames]);

  if (!featuredGames || featuredGames.length === 0) {
    return (
      <div className="w-full h-[500px] md:h-[600px] bg-[#0B0F19] animate-pulse"></div>
    );
  }

  const currentGame = featuredGames[currentIndex];

  return (
    <div className="relative w-full h-[500px] md:h-[600px] transition-all duration-700 overflow-hidden">
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
            <p className="text-lg text-gray-300 mb-8 drop-shadow-md">
              Jump back into the classic experience. Zero latency. Instant play.
              Hosted directly on your AWS Edge nodes.
            </p>

            <div className="flex flex-wrap gap-4">
              <button className="bg-[#00f2fe] hover:bg-blue-400 text-black font-bold py-3 px-8 rounded-lg shadow-[0_0_15px_rgba(0,242,254,0.4)] transition-all flex items-center gap-2">
                <Play className="w-5 h-5 fill-black" /> Play Now
              </button>
              <button className="bg-[#111827] hover:bg-gray-800 border border-gray-700 text-white font-bold py-3 px-8 rounded-lg transition-all flex items-center gap-2">
                <Plus className="w-5 h-5" /> Add to List
              </button>
            </div>

            {/* Little dot indicators at the bottom */}
            <div className="flex gap-2 mt-8">
              {featuredGames.map((_, idx) => (
                <div
                  key={idx}
                  className={`h-1.5 rounded-full transition-all duration-300 ${idx === currentIndex ? "w-8 bg-[#00f2fe]" : "w-4 bg-gray-600"}`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
