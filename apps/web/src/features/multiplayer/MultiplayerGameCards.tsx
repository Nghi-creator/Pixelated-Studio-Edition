import { Play } from "lucide-react";
import { Link } from "react-router-dom";
import { useState } from "react";
import {
  GameArtworkFallback,
} from "../../components/user/GameArtworkFallback";
import { isGeneratedCatalogArtworkUrl } from "../../components/user/gameArtworkUtils";
import { Skeleton } from "../../components/ui/Skeleton";
import { PixelIcon } from "../../components/ui/PixelIcon";
import type { ApiGame } from "../../lib/api/apiTypes";

export type GameSource = "cloud" | "local";

export type LocalGame = {
  id: string;
  title: string;
};

const multiplayerBackState = {
  backRoute: "/multiplayer",
  backText: "Back to Multiplayer",
};

export function CloudGameCard({ game }: { game: ApiGame }) {
  const [coverFailed, setCoverFailed] = useState(false);
  const showCover =
    Boolean(game.cover_url) &&
    !coverFailed &&
    !isGeneratedCatalogArtworkUrl(game.cover_url);

  return (
    <Link
      className="group overflow-hidden rounded-lg border border-synth-border bg-synth-bg transition-colors hover:bg-synth-surface"
      state={multiplayerBackState}
      to={`/play/${game.id}`}
    >
      <div className="aspect-[4/5] overflow-hidden bg-synth-bg">
        {showCover ? (
          <img
            alt={game.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            onError={() => setCoverFailed(true)}
            src={game.cover_url}
          />
        ) : (
          <GameArtworkFallback
            className="transition-transform duration-300 group-hover:scale-[1.03]"
            title={game.title}
          />
        )}
      </div>
      <div className="flex min-h-20 flex-col justify-between gap-3 border-t border-synth-border p-3">
        <p className="line-clamp-2 text-sm font-bold text-white">
          {game.title}
        </p>
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-synth-secondary">
          <Play className="h-3.5 w-3.5" />
          Host lobby
        </span>
      </div>
    </Link>
  );
}

export function LocalGameCard({ game }: { game: LocalGame }) {
  return (
    <Link
      className="group flex min-h-44 flex-col justify-between rounded-lg border border-synth-border bg-synth-bg p-4 transition-colors hover:bg-synth-surface"
      state={multiplayerBackState}
      to={`/play/${encodeURIComponent(game.id)}`}
    >
      <div>
        <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg border border-synth-border bg-synth-bg text-synth-secondary">
          <PixelIcon className="h-6 w-6" name="cartridge" />
        </div>
        <p className="line-clamp-3 text-sm font-bold text-white">{game.title}</p>
      </div>
      <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-synth-secondary">
        <Play className="h-3.5 w-3.5" />
        Host lobby
      </span>
    </Link>
  );
}

export function MultiplayerGameGridSkeleton({ source }: { source: GameSource }) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-5">
      {Array.from({ length: 10 }, (_, index) =>
        source === "cloud" ? (
          <div
            className="overflow-hidden rounded-lg border border-synth-border bg-synth-bg"
            key={index}
          >
            <Skeleton className="aspect-[4/5] w-full rounded-none" />
            <div className="flex min-h-20 flex-col justify-between gap-3 p-3">
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
        ) : (
          <div
            className="flex min-h-44 flex-col justify-between rounded-lg border border-synth-border bg-synth-bg p-4"
            key={index}
          >
            <div>
              <Skeleton className="mb-4 h-12 w-12 rounded-lg" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-4/5" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            </div>
            <Skeleton className="h-3 w-20" />
          </div>
        ),
      )}
    </div>
  );
}
