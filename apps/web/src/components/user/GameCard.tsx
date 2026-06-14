import { Heart, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useState } from "react";
import { useFavorite } from "../../features/favorites/useFavorite";

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
  const [favoriteError, setFavoriteError] = useState("");
  const {
    isFavorited,
    isPending,
    toggleFavorite: toggleFavoriteState,
  } = useFavorite(id);

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
      className="group relative block rounded-xl overflow-hidden bg-synth-surface border border-synth-border hover:border-synth-primary/55 hover:shadow-glow-primary-sm transition-all cursor-pointer"
    >
      <img
        src={coverUrl}
        alt={title}
        className="w-full h-64 md:h-72 object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-all duration-300"
      />

      <button
        onClick={toggleFavorite}
        aria-label={isFavorited ? `Remove ${title} from favorites` : `Add ${title} to favorites`}
        disabled={isPending}
        title={favoriteError || undefined}
        className="absolute top-2 right-2 bg-synth-bg/85 border border-synth-border/60 p-2 rounded-full opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity hover:scale-110 focus:outline-none z-10 backdrop-blur-sm disabled:cursor-wait disabled:opacity-70"
      >
        {isPending ? (
          <Loader2 className="h-5 w-5 animate-spin text-synth-primary" />
        ) : (
          <Heart
            className={`w-5 h-5 transition-colors ${isFavorited ? "fill-synth-primary text-synth-primary drop-shadow-[0_0_8px_rgba(255,77,143,0.5)]" : "text-white hover:text-synth-primary"}`}
          />
        )}
      </button>

      <div className="absolute bottom-0 w-full p-4 bg-gradient-to-t from-synth-bg via-synth-bg/92 to-transparent">
        <h3 className="font-bold text-lg truncate text-white">{title}</h3>
      </div>
    </Link>
  );
}
