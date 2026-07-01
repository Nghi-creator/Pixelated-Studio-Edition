import type {
  ApiFeaturedGamesResponse,
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
    countPlay: (gameId: string) =>
      apiRequest<{ success: true }>(`/games/${gameId}/play-count`, {
        method: "POST",
      }),
    favoriteIds: () => getFavoriteIds(),
    games: ({
      page = 1,
      pageSize = 15,
      search = "",
    }: {
      page?: number;
      pageSize?: number;
      search?: string;
    } = {}) => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (search.trim()) params.set("search", search.trim());

      return apiRequest<ApiPaginatedGamesResponse>(`/games?${params}`, {
        authenticated: false,
      });
    },
    featuredGames: () =>
      apiRequest<ApiFeaturedGamesResponse>("/games/featured", {
        authenticated: false,
        cache: "no-store",
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
