import { useCallback, useEffect, useState } from "react";
import { Search } from "lucide-react";
import HeroBanner from "../../components/user/HeroBanner";
import GameCard from "../../components/user/GameCard";
import { api } from "../../lib/apiClient";
import { GamesCatalogSkeleton, HeroSkeleton } from "../../components/ui/Skeleton";

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

export default function Landing() {
  const [games, setGames] = useState<Game[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [featuredGames, setFeaturedGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalGames, setTotalGames] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const fetchFeaturedGames = useCallback(async (isMounted = true) => {
    try {
      const data = await api.featuredGames();
      if (isMounted && data.featuredGames.length > 0) {
        setFeaturedGames(data.featuredGames);
      }
    } catch (error) {
      console.error("Error fetching featured games:", error);
    }
  }, []);

  const fetchGames = useCallback(async (isMounted = true) => {
    try {
      setLoadError("");
      setLoading(true);
      const data = await api.games({
        page: currentPage,
        pageSize: GAMES_PER_PAGE,
        search: searchQuery,
      });
      if (isMounted) {
        setGames(data.games);
        setFeaturedGames((currentFeaturedGames) =>
          currentFeaturedGames.length > 0
            ? currentFeaturedGames
            : data.featuredGames,
        );
        setTotalGames(data.total);
        setTotalPages(data.totalPages);
      }
    } catch (error) {
      console.error("Error fetching games:", error);
      if (isMounted) {
        setLoadError("Could not load the game library. Check the API connection.");
      }
    } finally {
      if (isMounted) setLoading(false);
    }
  }, [currentPage, searchQuery]);

  useEffect(() => {
    let isMounted = true;
    const timeout = window.setTimeout(() => {
      fetchGames(isMounted);
    }, searchQuery ? 250 : 0);

    return () => {
      isMounted = false;
      window.clearTimeout(timeout);
    };
  }, [fetchGames, searchQuery]);

  useEffect(() => {
    let isMounted = true;
    fetchFeaturedGames(isMounted);

    return () => {
      isMounted = false;
    };
  }, [fetchFeaturedGames]);

  useEffect(() => {
    if (!hasOnlyZeroPlayCounts(featuredGames)) return;

    let isMounted = true;
    const interval = window.setInterval(() => {
      fetchFeaturedGames(isMounted);
    }, ZERO_PLAY_FEATURED_REFRESH_MS);

    return () => {
      isMounted = false;
      window.clearInterval(interval);
    };
  }, [featuredGames, fetchFeaturedGames]);

  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pageStart = (safeCurrentPage - 1) * GAMES_PER_PAGE;

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const visiblePageNumbers = Array.from({ length: totalPages }, (_, index) => index + 1)
    .filter((page) => {
      if (totalPages <= 5) return true;
      return (
        page === 1 ||
        page === totalPages ||
        Math.abs(page - safeCurrentPage) <= 1
      );
    });

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
        {loading && games.length === 0 ? (
          <GamesCatalogSkeleton />
        ) : (
          <>
            <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <h2
                id="all-games"
                className="scroll-mt-24 text-2xl font-bold border-l-4 border-synth-secondary pl-3 drop-shadow-[0_0_12px_rgba(255,159,67,0.2)]"
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
                  className="block w-full pl-10 pr-3 py-2 border border-synth-border rounded-lg leading-5 bg-synth-surface text-gray-300 placeholder-gray-500 focus:outline-none focus:border-synth-primary focus:ring-1 focus:ring-synth-primary transition-colors shadow-inner"
                />
              </div>
            </div>

            {loadError ? (
              <div className="rounded-lg border border-red-400/30 bg-red-500/10 px-4 py-8 text-center text-red-200">
                {loadError}
              </div>
            ) : games.length === 0 ? (
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
                  {Math.min(pageStart + games.length, totalGames)} of{" "}
                  {totalGames}
                </p>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => changePage(Math.max(1, safeCurrentPage - 1))}
                    disabled={safeCurrentPage === 1}
                    className="h-10 rounded-lg border border-synth-border bg-synth-surface px-4 text-sm font-semibold text-gray-300 transition-colors hover:border-synth-primary/70 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Previous
                  </button>

                  {visiblePageNumbers.map((page, index) => {
                    const previousPage = visiblePageNumbers[index - 1];
                    const needsGap = previousPage && page - previousPage > 1;

                    return (
                      <span key={page} className="inline-flex items-center gap-2">
                        {needsGap && (
                          <span className="px-1 text-sm text-gray-600">...</span>
                        )}
                        <button
                          type="button"
                          onClick={() => changePage(page)}
                          className={`h-10 min-w-10 rounded-lg border px-3 text-sm font-bold transition-colors ${
                            page === safeCurrentPage
                              ? "border-synth-primary bg-synth-primary/15 text-white"
                              : "border-synth-border bg-synth-surface text-gray-400 hover:border-synth-primary/70 hover:text-white"
                          }`}
                        >
                          {page}
                        </button>
                      </span>
                    );
                  })}

                  <button
                    type="button"
                    onClick={() =>
                      changePage(Math.min(totalPages, safeCurrentPage + 1))
                    }
                    disabled={safeCurrentPage === totalPages}
                    className="h-10 rounded-lg border border-synth-border bg-synth-surface px-4 text-sm font-semibold text-gray-300 transition-colors hover:border-synth-primary/70 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
