import { Heart, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useState } from "react";
import { useFavorite } from "../../features/favorites/useFavorite";
import {
  GameArtworkFallback,
} from "./GameArtworkFallback";
import { isGeneratedCatalogArtworkUrl } from "./gameArtworkUtils";

interface GameCardProps {
  id: string;
  onFavoriteChange?: (favorited: boolean) => void;
  title: string;
  coverUrl: string;
}

export default function GameCard({
  id,
  onFavoriteChange,
  title,
  coverUrl,
}: GameCardProps) {
  const [coverFailed, setCoverFailed] = useState(false);
  const [favoriteError, setFavoriteError] = useState("");
  const {
    isFavorited,
    isPending,
    toggleFavorite: toggleFavoriteState,
  } = useFavorite(id);
  const showCover =
    Boolean(coverUrl) &&
    !coverFailed &&
    !isGeneratedCatalogArtworkUrl(coverUrl);

  const toggleFavorite = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isPending) return;

    setFavoriteError("");
    try {
      const changed = await toggleFavoriteState();
      if (changed) onFavoriteChange?.(!isFavorited);
    } catch {
      setFavoriteError("Could not update favorite.");
    }
  };

  return (
    <Link
      to={`/play/${id}`}
      className="group relative block overflow-hidden rounded-lg border border-synth-border bg-synth-surface transition-colors hover:bg-synth-elevated"
    >
      <div className="overflow-hidden bg-synth-bg">
        {showCover ? (
          <img
            src={coverUrl}
            alt={title}
            onError={() => setCoverFailed(true)}
            className="h-64 w-full object-cover transition-transform duration-300 group-hover:scale-[1.03] md:h-72"
          />
        ) : (
          <GameArtworkFallback
            className="h-64 transition-transform duration-300 group-hover:scale-[1.03] md:h-72"
            title={title}
          />
        )}
      </div>

      <button
        onClick={toggleFavorite}
        aria-label={isFavorited ? `Remove ${title} from favorites` : `Add ${title} to favorites`}
        disabled={isPending}
        title={favoriteError || undefined}
        className="absolute right-2 top-2 z-10 rounded-md border border-synth-border bg-synth-surface p-2 text-white transition-colors hover:bg-synth-elevated focus:outline-none disabled:cursor-wait disabled:opacity-70"
      >
        {isPending ? (
          <Loader2 className="h-5 w-5 animate-spin text-white" />
        ) : (
          <Heart
            className={`w-5 h-5 transition-colors ${isFavorited ? "fill-white text-white" : "text-white/80 hover:text-white"}`}
          />
        )}
      </button>

      <div className="border-t border-synth-border p-3">
        <h3 className="font-bold text-lg truncate text-white">{title}</h3>
      </div>
    </Link>
  );
}
