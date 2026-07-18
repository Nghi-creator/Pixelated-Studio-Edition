import type {
  ApiFeaturedGamesResponse,
  ApiCatalogFiltersResponse,
  ApiGame,
  ApiPaginatedGamesResponse,
} from "./apiTypes";

type CatalogApiDependencies = {
  apiRequest: <T>(path: string, options?: RequestInit & { authenticated?: boolean; timeoutMs?: number }) => Promise<T>;
  clearFavoritesCache: () => void;
  getFavoriteIds: () => Promise<Set<string>>;
};

export function createCatalogApi({
  apiRequest,
  clearFavoritesCache,
  getFavoriteIds,
}: CatalogApiDependencies) {
  return {
    countPlay: (gameId: string, playEventId: string) =>
      apiRequest<{ success: true }>(`/games/${gameId}/play-count`, {
        body: JSON.stringify({ clientEdition: "studio", playEventId, runtimeKind: "webrtc" }),
        method: "POST",
      }),
    favoriteIds: () => getFavoriteIds(),
    catalogFilters: (signal?: AbortSignal) =>
      apiRequest<ApiCatalogFiltersResponse>("/games/filters", {
        authenticated: false,
        signal,
      }),
    games: ({
      genre = "",
      license = "",
      page = 1,
      pageSize = 15,
      search = "",
      signal,
    }: {
      page?: number;
      pageSize?: number;
      genre?: string;
      license?: string;
      search?: string;
      signal?: AbortSignal;
    } = {}) => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (search.trim()) params.set("search", search.trim());
      if (genre) params.set("genre", genre);
      if (license) params.set("license", license);

      return apiRequest<ApiPaginatedGamesResponse>(`/games?${params}`, {
        authenticated: false,
        signal,
      });
    },
    featuredGames: (signal?: AbortSignal) =>
      apiRequest<ApiFeaturedGamesResponse>("/games/featured", {
        authenticated: false,
        cache: "no-store",
        signal,
      }),
    game: (gameId: string) =>
      apiRequest<{ game: ApiGame }>(`/games/${gameId}`, {
        authenticated: false,
      }),
    listFavorites: <TFavorite>() =>
      apiRequest<{ favorites: TFavorite[] }>("/favorites"),
    removeFavorite: async (gameId: string) => {
      const result = await apiRequest<void>(`/favorites/${gameId}`, {
        method: "DELETE",
      });
      clearFavoritesCache();
      return result;
    },
    saveFavorite: async (gameId: string) => {
      const result = await apiRequest<{ favorited: true }>(
        `/favorites/${gameId}`,
        {
          method: "PUT",
        },
      );
      clearFavoritesCache();
      return result;
    },
  };
}
