import { useMemo, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Heart, Loader2, X } from "lucide-react";
import { GameArtworkFallback } from "../../../components/user/GameArtworkFallback";
import { isGeneratedCatalogArtworkUrl } from "../../../components/user/gameArtworkUtils";
import { api } from "../../../lib/api/apiClient";
import { queryKeys } from "../../../lib/api/queryClient";
import { useFavorite } from "../useFavorite";

const LIBRARY_PICKER_PAGE_SIZE = 10;

export interface SavedGame {
  id: string;
  title: string;
  cover_url: string;
}

type LibraryGamePickerProps = {
  onClose: () => void;
  onFavoriteChange: (game: SavedGame, favorited: boolean) => void;
};

export function LibraryGamePicker({
  onClose,
  onFavoriteChange,
}: LibraryGamePickerProps) {
  const catalogQuery = useInfiniteQuery({
    initialPageParam: 1,
    queryKey: queryKeys.libraryGamePicker(LIBRARY_PICKER_PAGE_SIZE),
    queryFn: ({ pageParam }) =>
      api.games({ page: pageParam, pageSize: LIBRARY_PICKER_PAGE_SIZE }),
    getNextPageParam: (lastPage) =>
      lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined,
  });

  const games = useMemo(
    () =>
      catalogQuery.data?.pages.flatMap((page) => page.games as SavedGame[]) ||
      [],
    [catalogQuery.data?.pages],
  );

  const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const target = event.currentTarget;
    const distanceFromBottom =
      target.scrollHeight - target.scrollTop - target.clientHeight;

    if (
      distanceFromBottom < 96 &&
      catalogQuery.hasNextPage &&
      !catalogQuery.isFetchingNextPage
    ) {
      void catalogQuery.fetchNextPage();
    }
  };

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4"
      role="dialog"
    >
      <div className="flex max-h-[86vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-synth-border bg-[#12070D] shadow-card">
        <div className="flex items-start justify-between gap-4 border-b border-synth-border px-5 py-4">
          <div>
            <h2 className="text-xl font-black text-white">Add games</h2>
            <p className="mt-1 text-sm text-gray-400">
              Browse the catalog and choose what belongs in your library.
            </p>
          </div>
          <button
            aria-label="Close add games"
            className="rounded-md border border-synth-border bg-synth-surface p-2 text-gray-300 transition-colors hover:text-white"
            onClick={onClose}
            type="button"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div
          className="min-h-0 overflow-y-auto px-5 py-4"
          onScroll={handleScroll}
        >
          {catalogQuery.isLoading ? (
            <div className="flex min-h-60 items-center justify-center text-gray-300">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Loading games...
            </div>
          ) : catalogQuery.isError ? (
            <div className="danger-panel rounded-lg border px-4 py-8 text-center font-bold">
              <p>Could not load games. Try again.</p>
              <button
                className="danger-action mt-4 rounded-lg border px-4 py-2 text-sm font-bold transition-colors"
                onClick={() => void catalogQuery.refetch()}
                type="button"
              >
                Retry
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {games.map((game) => (
                <LibraryGamePickerRow
                  game={game}
                  key={game.id}
                  onFavoriteChange={onFavoriteChange}
                />
              ))}

              {catalogQuery.isFetchingNextPage && (
                <div className="flex items-center justify-center py-5 text-sm font-semibold text-gray-400">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading 10 more games...
                </div>
              )}

              {!catalogQuery.hasNextPage && games.length > 0 && (
                <p className="py-4 text-center text-sm text-gray-500">
                  End of catalog
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LibraryGamePickerRow({
  game,
  onFavoriteChange,
}: {
  game: SavedGame;
  onFavoriteChange: (game: SavedGame, favorited: boolean) => void;
}) {
  const [coverFailed, setCoverFailed] = useState(false);
  const [favoriteError, setFavoriteError] = useState("");
  const { isFavorited, isPending, toggleFavorite } = useFavorite(game.id);
  const showCover =
    Boolean(game.cover_url) &&
    !coverFailed &&
    !isGeneratedCatalogArtworkUrl(game.cover_url);

  const handleFavoriteClick = async () => {
    if (isPending) return;

    setFavoriteError("");
    try {
      const changed = await toggleFavorite();
      if (changed) onFavoriteChange(game, !isFavorited);
    } catch {
      setFavoriteError("Could not update favorite.");
    }
  };

  return (
    <article className="flex items-center gap-4 rounded-lg border border-synth-border bg-synth-surface p-3">
      <div className="h-24 w-20 shrink-0 overflow-hidden rounded-md border border-synth-border bg-synth-bg">
        {showCover ? (
          <img
            alt={game.title}
            className="h-full w-full object-cover"
            onError={() => setCoverFailed(true)}
            src={game.cover_url}
          />
        ) : (
          <GameArtworkFallback className="h-full" title={game.title} />
        )}
      </div>

      <h3 className="min-w-0 flex-1 truncate text-base font-bold text-white">
        {game.title}
      </h3>

      <button
        aria-label={
          isFavorited
            ? `Remove ${game.title} from library`
            : `Add ${game.title} to library`
        }
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-synth-border bg-synth-bg text-white transition-colors hover:bg-synth-elevated disabled:cursor-wait disabled:opacity-70"
        disabled={isPending}
        onClick={() => void handleFavoriteClick()}
        title={favoriteError || undefined}
        type="button"
      >
        {isPending ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <Heart
            className={`h-5 w-5 transition-colors ${
              isFavorited ? "fill-white text-white" : "text-white/80"
            }`}
          />
        )}
      </button>
    </article>
  );
}
