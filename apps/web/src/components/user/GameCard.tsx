import { FlaskConical, Heart, Loader2 } from "lucide-react";
import { Link } from "react-router";
import { useState } from "react";
import { useFavorite } from "../../hooks/useFavorite";
import {
  GameArtworkFallback,
} from "./GameArtworkFallback";
import { isGeneratedCatalogArtworkUrl } from "./gameArtworkUtils";
import { getGameDestination } from "../../features/research-mode/researchRoutes";
import type { PlayerExperience } from "../../features/research-mode/researchRoutes";

interface GameCardProps {
  destination?: string;
  experience?: PlayerExperience;
  id: string;
  onFavoriteChange?: (favorited: boolean) => void;
  title: string;
  coverUrl: string;
}

function FavoriteAction({
  id,
  onFavoriteChange,
  title,
}: Pick<GameCardProps, "id" | "onFavoriteChange" | "title">) {
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
  );
}

export default function GameCard({
  destination,
  experience = "normal",
  id,
  onFavoriteChange,
  title,
  coverUrl,
}: GameCardProps) {
  const [coverFailed, setCoverFailed] = useState(false);
  const showCover =
    Boolean(coverUrl) &&
    !coverFailed &&
    !isGeneratedCatalogArtworkUrl(coverUrl);

  return (
    <Link
      to={destination || getGameDestination(id, experience)}
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

      {experience === "research" ? (
        <span
          aria-label={`${title} opens research run setup`}
          className="absolute right-2 top-2 z-10 inline-flex rounded-md border border-synth-action-hover bg-synth-action p-2 text-white"
          title="Research run setup"
        >
          <FlaskConical aria-hidden="true" className="h-5 w-5" />
        </span>
      ) : (
        <FavoriteAction
          id={id}
          onFavoriteChange={onFavoriteChange}
          title={title}
        />
      )}

      <div className="border-t border-synth-border p-3">
        <h3 className="font-bold text-lg truncate text-white">{title}</h3>
      </div>
    </Link>
  );
}
