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
import {
  GameArtworkFallback,
} from "./GameArtworkFallback";
import { isGeneratedCatalogArtworkUrl } from "./gameArtworkUtils";

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
  const [failedArtworkIds, setFailedArtworkIds] = useState<Set<string>>(
    () => new Set(),
  );
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

  const markArtworkFailed = (gameId: string) => {
    setFailedArtworkIds((current) => {
      const next = new Set(current);
      next.add(gameId);
      return next;
    });
  };

  if (!featuredGames || featuredGames.length === 0) {
    return (
      <div className="w-full h-[360px] md:h-[440px] bg-synth-bg animate-pulse" />
    );
  }

  return (
    <div className="relative h-[380px] w-full overflow-hidden border-b border-synth-border bg-synth-bg transition-all duration-700 group md:h-[460px]">
      {featuredGames.map((game, index) => {
        const artworkUrl = game.backdrop_url || game.cover_url;
        const isActive = index === safeCurrentIndex;
        const artworkFailed =
          failedArtworkIds.has(game.id) ||
          isGeneratedCatalogArtworkUrl(artworkUrl);

        return artworkUrl && !artworkFailed ? (
          <img
            key={game.id}
            className={`absolute inset-0 h-full w-full object-cover object-center transition-opacity duration-1000 ${isActive ? "opacity-70" : "opacity-0"}`}
            src={artworkUrl}
            alt={game.title}
            onError={() => markArtworkFailed(game.id)}
          />
        ) : (
          <GameArtworkFallback
            key={game.id}
            className={`absolute inset-0 transition-opacity duration-1000 ${isActive ? "opacity-70" : "opacity-0"}`}
            label="Featured game"
            title={game.title}
            variant="backdrop"
          />
        );
      })}
      <div className="absolute inset-0 bg-black/52" />
      <div className="absolute inset-y-0 left-0 w-full bg-gradient-to-r from-synth-bg via-synth-bg/80 to-transparent md:w-3/4" />

      {featuredGames.length > 1 && (
        <>
          <button
            aria-label="Previous featured game"
            onClick={handlePrev}
            type="button"
            className="absolute left-4 top-1/2 z-30 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-synth-border bg-synth-surface text-white opacity-0 transition-colors hover:bg-synth-elevated group-hover:opacity-100"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <button
            aria-label="Next featured game"
            onClick={handleNext}
            type="button"
            className="absolute right-4 top-1/2 z-30 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-synth-border bg-synth-surface text-white opacity-0 transition-colors hover:bg-synth-elevated group-hover:opacity-100"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        </>
      )}

      <div className="absolute top-1/2 left-0 transform -translate-y-1/2 z-20 w-full">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <span className="mb-3 inline-flex items-center gap-2 rounded-md border border-synth-border bg-synth-surface px-2.5 py-1 text-[11px] font-bold uppercase text-white">
              <span className="h-1.5 w-1.5 rounded-full bg-synth-secondary" />
              Trending Now
            </span>
            <h1 className="mb-4 text-4xl font-extrabold text-white md:text-6xl">
              {currentGame.title}
            </h1>

            <div className="flex flex-wrap gap-4">
              <button
                onClick={() => navigate(`/play/${currentGame.id}`)}
                type="button"
                className="flex items-center gap-2 rounded-lg border border-synth-border bg-synth-primary px-6 py-2.5 font-bold text-white transition-colors hover:bg-synth-primary-hover active:scale-[0.98]"
              >
                <Play className="w-5 h-5 fill-white" /> Play Now
              </button>

              <button
                onClick={toggleFavorite}
                disabled={isPending}
                title={favoriteError || undefined}
                type="button"
                className={`border font-bold py-2.5 px-6 rounded-lg transition-all flex items-center gap-2 disabled:cursor-wait disabled:opacity-60 ${
                  isFavorited
                    ? "bg-synth-elevated border-synth-border text-white hover:bg-synth-surface"
                    : "bg-synth-surface hover:bg-synth-elevated border-synth-border text-white"
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

            <div className="flex gap-2 mt-6">
              {featuredGames.map((game, idx) => (
                <button
                  aria-label={`Show ${game.title}`}
                  key={game.id}
                  onClick={() => setCurrentIndex(idx)}
                  type="button"
                  className={`h-1.5 rounded-full cursor-pointer transition-all duration-300 ${idx === safeCurrentIndex ? "w-8 bg-synth-secondary" : "w-4 bg-synth-border hover:bg-synth-primary"}`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
