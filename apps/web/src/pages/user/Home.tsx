import { useEffect, useState } from "react";
import { Loader2, Search } from "lucide-react";
import HeroBanner from "../../components/user/HeroBanner";
import GameCard from "../../components/user/GameCard";
import {
  useFeaturedGamesQuery,
  useGameCatalogQuery,
} from "../../lib/api/apiQueries";
import {
  GameGridSkeleton,
  GamesCatalogSkeleton,
  HeroSkeleton,
} from "../../components/ui/Skeleton";
import { Pagination } from "../../components/ui/Pagination";

const GAMES_PER_PAGE = 15;
const ZERO_PLAY_FEATURED_REFRESH_MS = 30_000;

interface Game {
  id: string;
  title: string;
  cover_url: string;
  rom_filename?: string | null;
  backdrop_url?: string | null;
  play_count?: number | null;
}

const hasOnlyZeroPlayCounts = (games: Game[]) =>
  games.length > 1 &&
  games.every((game) => !game.play_count || game.play_count <= 0);

function CatalogRefreshPanel({ label }: { label: string }) {
  return (
    <div className="relative" role="status" aria-label={label}>
      <div className="mb-4 inline-flex items-center gap-2 rounded-md border border-synth-border bg-synth-surface px-3 py-1.5 text-sm font-semibold text-white">
        <Loader2 className="h-4 w-4 animate-spin" />
        {label}
      </div>
      <GameGridSkeleton />
    </div>
  );
}

export default function Home() {
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const catalogQuery = useGameCatalogQuery({
    page: currentPage,
    pageSize: GAMES_PER_PAGE,
    search: searchQuery,
  });
  const featuredQuery = useFeaturedGamesQuery();

  const games = (catalogQuery.data?.games || []) as Game[];
  const featuredGames = featuredQuery.data?.featuredGames.length
    ? (featuredQuery.data.featuredGames as Game[])
    : ((catalogQuery.data?.featuredGames || []) as Game[]);
  const loading = catalogQuery.isLoading;
  const loadError = catalogQuery.isError
    ? "Could not load the game library. Check the API connection."
    : "";
  const totalGames = catalogQuery.data?.total || 0;
  const totalPages = catalogQuery.data?.totalPages || 1;
  const shouldRefreshFeatured = hasOnlyZeroPlayCounts(featuredGames);
  const refetchFeaturedGames = featuredQuery.refetch;

  useEffect(() => {
    if (!shouldRefreshFeatured) return;

    const interval = window.setInterval(() => {
      void refetchFeaturedGames();
    }, ZERO_PLAY_FEATURED_REFRESH_MS);

    return () => window.clearInterval(interval);
  }, [refetchFeaturedGames, shouldRefreshFeatured]);

  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pageStart = (safeCurrentPage - 1) * GAMES_PER_PAGE;
  const showInitialCatalogSkeleton = loading && games.length === 0 && !searchQuery;
  const showCatalogRefreshPanel =
    catalogQuery.isFetching &&
    (games.length > 0 || Boolean(searchQuery));
  const catalogRefreshLabel = searchQuery
    ? "Searching games..."
    : "Loading games...";

  const changePage = (page: number) => {
    setCurrentPage(page);
    document
      .getElementById("all-games")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="flex flex-col min-h-screen">
      {loading && featuredGames.length === 0 ? (
        <HeroSkeleton />
      ) : (
        <HeroBanner featuredGames={featuredGames} />
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 w-full">
        <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <h2
            id="all-games"
            className="scroll-mt-24 text-2xl font-bold text-white"
          >
            All Games
          </h2>

          <div className="relative w-full md:w-96">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="text-gray-400 w-4 h-4" />
            </div>
            <input
              type="text"
              placeholder="Search games..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="block w-full rounded-lg border border-synth-border bg-synth-bg py-2 pl-10 pr-10 leading-5 text-white placeholder:text-gray-500 transition-colors focus:border-synth-secondary focus:outline-none"
            />
          </div>
        </div>

        {showInitialCatalogSkeleton ? (
          <GamesCatalogSkeleton />
        ) : showCatalogRefreshPanel ? (
          <CatalogRefreshPanel label={catalogRefreshLabel} />
        ) : loadError ? (
          <div className="danger-panel rounded-lg border px-4 py-8 text-center font-bold">
            <p>{loadError}</p>
            <button
              className="danger-action mt-4 rounded-lg border px-4 py-2 text-sm font-bold transition-colors"
              onClick={() => void catalogQuery.refetch()}
              type="button"
            >
              Retry
            </button>
          </div>
        ) : games.length === 0 && !loading && !catalogQuery.isFetching ? (
          <div className="text-center py-20 text-gray-500">
            <Search className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p className="text-xl">No games found matching "{searchQuery}"</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
            {games.map((game) => (
              <GameCard
                key={game.id}
                id={game.id}
                title={game.title}
                coverUrl={game.cover_url}
              />
            ))}
          </div>
        )}

        {!loadError && games.length > 0 && totalPages > 1 && (
          <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-gray-500">
              Showing {pageStart + 1}-
              {Math.min(pageStart + games.length, totalGames)} of {totalGames}
            </p>

            <Pagination
              currentPage={safeCurrentPage}
              onPageChange={changePage}
              totalPages={totalPages}
            />
          </div>
        )}
      </div>
    </div>
  );
}
