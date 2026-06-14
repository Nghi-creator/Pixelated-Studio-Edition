import {
  Play,
  Plus,
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useFavorite } from "../../features/favorites/useFavorite";

interface Game {
  id: string;
  title: string;
  cover_url: string;
  backdrop_url?: string | null;
}

interface HeroBannerProps {
  featuredGames: Game[];
}

export default function HeroBanner({ featuredGames }: HeroBannerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [favoriteError, setFavoriteError] = useState("");
  const navigate = useNavigate();
  const safeCurrentIndex = Math.min(
    currentIndex,
    Math.max(0, featuredGames.length - 1),
  );
  const currentGame = featuredGames[safeCurrentIndex];
  const {
    isFavorited,
    isPending,
    toggleFavorite: toggleFavoriteState,
  } = useFavorite(currentGame?.id || "");

  // Automatically rotate the banner every 5 seconds
  useEffect(() => {
    if (featuredGames.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % featuredGames.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [featuredGames]);

  const toggleFavorite = async () => {
    if (!currentGame || isPending) return;
    setFavoriteError("");
    try {
      await toggleFavoriteState();
    } catch {
      setFavoriteError("Could not update your library. Try again.");
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
      <div className="w-full h-[360px] md:h-[440px] bg-synth-bg animate-pulse"></div>
    );
  }

  return (
    <div className="relative w-full h-[360px] md:h-[440px] transition-all duration-700 overflow-hidden group">
      {/* Gradients */}
      <div className="absolute inset-0 bg-gradient-to-r from-synth-bg via-synth-bg/65 to-transparent z-10"></div>
      <div className="absolute inset-0 bg-gradient-to-t from-synth-bg via-synth-primary/10 to-transparent z-10"></div>

      {/* Crossfading Images Loop */}
      {featuredGames.map((game, index) => (
        <img
          key={game.id}
          className={`absolute inset-0 h-full w-full object-cover object-center transition-opacity duration-1000 ${index === safeCurrentIndex ? "opacity-80" : "opacity-0"}`}
          src={game.backdrop_url || game.cover_url}
          alt={game.title}
        />
      ))}

      {/* Navigation Arrows */}
      {featuredGames.length > 1 && (
        <>
          <button
            aria-label="Previous featured game"
            onClick={handlePrev}
            type="button"
            className="absolute left-4 top-1/2 -translate-y-1/2 z-30 p-2 bg-black/45 hover:bg-synth-primary/25 border border-white/10 hover:border-synth-primary/50 text-white rounded-full backdrop-blur-md transition-all opacity-0 group-hover:opacity-100 shadow-glow-primary-sm"
          >
            <ChevronLeft className="w-8 h-8" />
          </button>
          <button
            aria-label="Next featured game"
            onClick={handleNext}
            type="button"
            className="absolute right-4 top-1/2 -translate-y-1/2 z-30 p-2 bg-black/45 hover:bg-synth-primary/25 border border-white/10 hover:border-synth-primary/50 text-white rounded-full backdrop-blur-md transition-all opacity-0 group-hover:opacity-100 shadow-glow-primary-sm"
          >
            <ChevronRight className="w-8 h-8" />
          </button>
        </>
      )}

      {/* Content */}
      <div className="absolute top-1/2 left-0 transform -translate-y-1/2 z-20 w-full">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <span className="mb-3 inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/10 px-2.5 py-1 text-[11px] font-bold uppercase text-synth-secondary shadow-glow-primary-sm backdrop-blur-md">
              <span className="h-1.5 w-1.5 rounded-full bg-synth-primary shadow-glow-primary-sm" />
              Trending Now
            </span>
            <h1 className="mb-4 text-4xl font-extrabold text-white [text-shadow:0_0_40px_rgba(255,77,143,0.25),0_2px_12px_rgba(0,0,0,0.6)] md:text-6xl">
              {currentGame.title}
            </h1>

            <div className="flex flex-wrap gap-4">
              <button
                onClick={() => navigate(`/play/${currentGame.id}`)}
                type="button"
                className="bg-synth-primary hover:bg-synth-primary-hover text-synth-ink font-bold py-2.5 px-6 rounded-lg shadow-glow-primary transition-all flex items-center gap-2 active:scale-[0.98]"
              >
                <Play className="w-5 h-5 fill-synth-ink" /> Play Now
              </button>

              {/* Dynamic Add/Remove List Button */}
              <button
                onClick={toggleFavorite}
                disabled={isPending}
                title={favoriteError || undefined}
                type="button"
                className={`border font-bold py-2.5 px-6 rounded-lg transition-all flex items-center gap-2 disabled:cursor-wait disabled:opacity-60 ${
                  isFavorited
                    ? "bg-synth-primary/10 border-synth-primary text-synth-primary hover:bg-synth-primary/20 shadow-glow-primary-sm"
                    : "bg-synth-surface/90 hover:bg-synth-elevated border-synth-border text-white hover:border-synth-secondary/50"
                }`}
              >
                {isPending ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" /> Updating...
                  </>
                ) : isFavorited ? (
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
            <div className="flex gap-2 mt-6">
              {featuredGames.map((game, idx) => (
                <button
                  aria-label={`Show ${game.title}`}
                  key={game.id}
                  onClick={() => setCurrentIndex(idx)}
                  type="button"
                  className={`h-1.5 rounded-full cursor-pointer transition-all duration-300 ${idx === safeCurrentIndex ? "w-8 bg-synth-primary shadow-glow-primary-sm" : "w-4 bg-synth-border hover:bg-synth-secondary/80"}`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
