import { Gamepad2, Play } from "lucide-react";
import { Link } from "react-router-dom";
import { Skeleton } from "../../components/ui/Skeleton";
import type { ApiGame } from "../../lib/apiTypes";

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
  return (
    <Link
      className="group overflow-hidden rounded-lg border border-synth-border bg-synth-surface transition-all hover:border-synth-primary/60 hover:shadow-glow-primary-sm"
      state={multiplayerBackState}
      to={`/play/${game.id}`}
    >
      <div className="aspect-[4/5] overflow-hidden bg-synth-bg">
        <img
          alt={game.title}
          className="h-full w-full object-cover opacity-80 transition-all duration-300 group-hover:scale-105 group-hover:opacity-100"
          src={game.cover_url}
        />
      </div>
      <div className="flex min-h-20 flex-col justify-between gap-3 p-3">
        <p className="line-clamp-2 text-sm font-bold text-white">
          {game.title}
        </p>
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-synth-primary">
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
      className="group flex min-h-44 flex-col justify-between rounded-lg border border-synth-border bg-synth-surface p-4 transition-all hover:border-synth-secondary/70 hover:shadow-glow-primary-sm"
      state={multiplayerBackState}
      to={`/play/${encodeURIComponent(game.id)}`}
    >
      <div>
        <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg border border-synth-border bg-synth-bg text-synth-secondary">
          <Gamepad2 className="h-6 w-6" />
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
            className="overflow-hidden rounded-lg border border-synth-border bg-synth-surface"
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
            className="flex min-h-44 flex-col justify-between rounded-lg border border-synth-border bg-synth-surface p-4"
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

