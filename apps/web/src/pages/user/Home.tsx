import { useEffect, useState } from "react";
import { Loader2, RotateCcw, Search } from "lucide-react";
import HeroBanner from "../../components/user/HeroBanner";
import GameCard from "../../components/user/GameCard";
import {
  useCatalogFiltersQuery,
  useFeaturedGamesQuery,
  useGameCatalogQuery,
} from "../../lib/api/apiQueries";
import {
  GameGridSkeleton,
  GamesCatalogSkeleton,
  HeroSkeleton,
} from "../../components/ui/skeleton/UserSkeletons";
import { Pagination } from "../../components/ui/Pagination";
import { AdminSelect } from "../../components/ui/AdminSelect";
import { useDebouncedValue } from "../../lib/useDebouncedValue";
import {
  CATALOG_PLATFORM_OPTIONS,
  formatGenre,
} from "../../features/catalog/catalogMetadata";

const GAMES_PER_PAGE = 15;
const ZERO_PLAY_FEATURED_REFRESH_MS = 30_000;
const MAX_ZERO_PLAY_FEATURED_REFRESHES = 3;
const SEARCH_DEBOUNCE_MS = 250;

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
  const [genreFilter, setGenreFilter] = useState("");
  const [licenseFilter, setLicenseFilter] = useState("");
  const [platformFilter, setPlatformFilter] = useState("");
  const debouncedSearchQuery = useDebouncedValue(
    searchQuery.trim(),
    SEARCH_DEBOUNCE_MS,
  );
  const [zeroPlayRefreshCount, setZeroPlayRefreshCount] = useState(0);

  const catalogQuery = useGameCatalogQuery({
    page: currentPage,
    pageSize: GAMES_PER_PAGE,
    genre: genreFilter,
    license: licenseFilter,
    platform: platformFilter,
    search: debouncedSearchQuery,
  });
  const featuredQuery = useFeaturedGamesQuery();
  const filtersQuery = useCatalogFiltersQuery();
  const availableGenres = filtersQuery.data?.genres || [];
  const availableLicenses = filtersQuery.data?.licenses || [];

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
    if (
      !shouldRefreshFeatured ||
      zeroPlayRefreshCount >= MAX_ZERO_PLAY_FEATURED_REFRESHES
    ) {
      return;
    }

    const refresh = () => {
      setZeroPlayRefreshCount((count) => count + 1);
      void refetchFeaturedGames();
    };
    let timeout: number | null = null;
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };

    if (document.visibilityState === "hidden") {
      document.addEventListener("visibilitychange", refreshWhenVisible, {
        once: true,
      });
    } else {
      timeout = window.setTimeout(refresh, ZERO_PLAY_FEATURED_REFRESH_MS);
    }

    return () => {
      if (timeout !== null) window.clearTimeout(timeout);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [refetchFeaturedGames, shouldRefreshFeatured, zeroPlayRefreshCount]);

  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pageStart = (safeCurrentPage - 1) * GAMES_PER_PAGE;
  const isSearchSettling = searchQuery.trim() !== debouncedSearchQuery;
  const showInitialCatalogSkeleton =
    loading && games.length === 0 && !debouncedSearchQuery;
  const showCatalogRefreshPanel =
    (catalogQuery.isFetching || isSearchSettling) &&
    (games.length > 0 || Boolean(searchQuery));
  const catalogRefreshLabel = searchQuery
    ? "Searching games..."
    : "Loading games...";
  const hasActiveFilters = Boolean(
    searchQuery || platformFilter || genreFilter || licenseFilter,
  );

  const changePage = (page: number) => {
    setCurrentPage(page);
    document
      .getElementById("all-games")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const resetFilters = () => {
    setSearchQuery("");
    setPlatformFilter("");
    setGenreFilter("");
    setLicenseFilter("");
    setCurrentPage(1);
  };

  return (
    <div className="flex flex-col min-h-screen">
      {loading && featuredGames.length === 0 ? (
        <HeroSkeleton />
      ) : (
        <HeroBanner featuredGames={featuredGames} />
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 w-full">
        {!showInitialCatalogSkeleton && (
          <div className="mb-8 space-y-3">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <h2
                id="all-games"
                className="scroll-mt-24 text-2xl font-bold text-white"
              >
                All Games
              </h2>

              <div className="grid w-full lg:max-w-3xl lg:grid-cols-3">
                <div className="relative w-full lg:col-span-2 lg:col-start-2">
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
                    className="block w-full rounded-lg border border-synth-border bg-synth-bg py-2 pl-10 pr-3 leading-5 text-white placeholder:text-gray-500 transition-colors focus:border-synth-secondary focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <button
                className="inline-flex h-10 items-center justify-center gap-2 self-start rounded-lg border border-synth-secondary/40 bg-synth-bg px-4 text-sm font-semibold text-white transition-colors hover:border-synth-secondary hover:bg-synth-elevated disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-synth-bg"
                disabled={!hasActiveFilters}
                onClick={resetFilters}
                type="button"
              >
                <RotateCcw className="h-4 w-4" />
                Reset filters
              </button>
              <div className="grid w-full gap-3 sm:grid-cols-3 lg:max-w-3xl">
                <AdminSelect
                  ariaLabel="Game system"
                  className="w-full"
                  onChange={(value) => {
                    setPlatformFilter(value);
                    setCurrentPage(1);
                  }}
                  options={[
                    { label: "All systems", value: "" },
                    ...CATALOG_PLATFORM_OPTIONS.map((platform) => ({
                      label: platform.label,
                      value: platform.id,
                    })),
                  ]}
                  value={platformFilter}
                />
                <AdminSelect
                  ariaLabel="Game genre"
                  className="w-full"
                  onChange={(value) => {
                    setGenreFilter(value);
                    setCurrentPage(1);
                  }}
                  options={[
                    { label: "All genres", value: "" },
                    ...availableGenres.map((genre) => ({
                      label: formatGenre(genre),
                      value: genre,
                    })),
                  ]}
                  value={genreFilter}
                />
                <AdminSelect
                  ariaLabel="Game license"
                  className="w-full"
                  onChange={(value) => {
                    setLicenseFilter(value);
                    setCurrentPage(1);
                  }}
                  options={[
                    { label: "All licenses", value: "" },
                    ...availableLicenses.map((license) => ({
                      label: license,
                      value: license,
                    })),
                  ]}
                  value={licenseFilter}
                />
              </div>
            </div>
          </div>
        )}

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
        ) : games.length === 0 &&
          !loading &&
          !catalogQuery.isFetching &&
          !isSearchSettling ? (
          <div className="text-center py-20 text-gray-500">
            <Search className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p className="text-xl">
              {searchQuery
                ? `No games found matching “${searchQuery}” with these filters.`
                : "No games match the selected system, genre, and license filters."}
            </p>
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
