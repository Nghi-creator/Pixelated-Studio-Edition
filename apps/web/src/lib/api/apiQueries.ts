import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { getAuthSession, api } from "./apiClient";
import { queryKeys } from "./queryClient";
import type {
  ApiGame,
  ApiCatalogCandidateSourceKind,
  ApiCatalogCandidateStatus,
  ApiGameSubmissionStatus,
  ApiPaginatedCatalogCandidatesResponse,
  ApiPaginatedGameSubmissionsResponse,
  ApiPaginatedAccessLogsResponse,
  ApiPaginatedReportsResponse,
  ApiPaginatedUsersResponse,
} from "./apiTypes";

export function useAccessLogsQuery<TLog>(page: number, pageSize: number) {
  return useQuery({
    queryKey: queryKeys.accessLogs(page, pageSize),
    queryFn: () => api.accessLogs<TLog>(page, pageSize),
  });
}

export function useAdminReportsQuery<TReport>(
  page: number,
  pageSize: number,
  targetRole: "all" | "users" | "admins",
  { enabled = true }: { enabled?: boolean } = {},
) {
  return useQuery<ApiPaginatedReportsResponse<TReport>>({
    enabled,
    queryKey: queryKeys.adminReports(page, pageSize, targetRole),
    queryFn: () => api.adminReports<TReport>(page, pageSize, targetRole),
  });
}

export function useAdminUsersQuery<TUser>({
  enabled,
  page,
  pageSize,
  search,
}: {
  enabled: boolean;
  page: number;
  pageSize: number;
  search: string;
}) {
  return useQuery<ApiPaginatedUsersResponse<TUser>>({
    enabled,
    queryKey: queryKeys.adminUsers(page, pageSize, search),
    queryFn: () => api.users<TUser>({ page, pageSize, search }),
  });
}

export function useCatalogCandidatesQuery<TCandidate>({
  enabled = true,
  page,
  pageSize,
  platformId,
  search,
  sourceKind,
  status,
}: {
  enabled?: boolean;
  page: number;
  pageSize: number;
  platformId: string;
  search: string;
  sourceKind: ApiCatalogCandidateSourceKind | "";
  status: ApiCatalogCandidateStatus;
}) {
  return useQuery<ApiPaginatedCatalogCandidatesResponse<TCandidate>>({
    enabled,
    queryKey: queryKeys.catalogCandidates(
      page,
      pageSize,
      status,
      sourceKind,
      platformId,
      search,
    ),
    queryFn: () =>
      api.catalogCandidates<TCandidate>({
        page,
        pageSize,
        platformId,
        search,
        sourceKind,
        status,
      }),
  });
}

export function useGameSubmissionsQuery<TSubmission>({
  enabled = true,
  page,
  pageSize,
  search,
  status,
}: {
  enabled?: boolean;
  page: number;
  pageSize: number;
  search: string;
  status: ApiGameSubmissionStatus;
}) {
  return useQuery<ApiPaginatedGameSubmissionsResponse<TSubmission>>({
    enabled,
    queryKey: queryKeys.gameSubmissions(page, pageSize, status, search),
    queryFn: () =>
      api.gameSubmissions<TSubmission>({
        page,
        pageSize,
        search,
        status,
      }),
  });
}

export function useAuthSessionQuery() {
  return useQuery({
    queryKey: queryKeys.authSession(),
    queryFn: getAuthSession,
  });
}

export function useFavoriteIdsQuery() {
  return useQuery({
    queryKey: queryKeys.favoriteIds(),
    queryFn: async () => {
      const session = await getAuthSession();
      if (!session) return new Set<string>();
      return api.favoriteIds();
    },
  });
}

export function useFavoritesQuery<TFavorite>({
  onMissingSession,
}: {
  onMissingSession?: () => void;
} = {}) {
  return useQuery({
    queryKey: queryKeys.favorites(),
    queryFn: async () => {
      const session = await getAuthSession();
      if (!session) {
        onMissingSession?.();
        return { favorites: [] as TFavorite[] };
      }

      return api.listFavorites<TFavorite>();
    },
  });
}

export function useFeaturedGamesQuery() {
  return useQuery({
    queryKey: queryKeys.featuredGames(),
    queryFn: api.featuredGames,
  });
}

export function useGameCatalogQuery({
  page,
  pageSize,
  search,
  enabled = true,
}: {
  enabled?: boolean;
  page: number;
  pageSize: number;
  search: string;
}) {
  return useQuery({
    enabled,
    queryKey: queryKeys.gameCatalog(page, pageSize, search),
    queryFn: () => api.games({ page, pageSize, search }),
  });
}

export function useGameCommentsQuery<TComment>(
  gameId: string | undefined,
) {
  return useInfiniteQuery({
    enabled: Boolean(gameId),
    initialPageParam: 1,
    queryKey: queryKeys.gameComments(gameId),
    queryFn: ({ pageParam }) =>
      api.gameComments<TComment>(gameId!, pageParam),
    getNextPageParam: (lastPage, allPages) =>
      lastPage.hasMore ? allPages.length + 1 : undefined,
  });
}

export function useGameMetadataQuery(gameId: string | undefined) {
  return useQuery<{ game: ApiGame }>({
    enabled: Boolean(gameId),
    queryKey: queryKeys.game(gameId),
    queryFn: () => api.game(gameId!),
  });
}

export function useGameReactionsQuery(gameId: string | undefined) {
  return useQuery({
    enabled: Boolean(gameId),
    queryKey: queryKeys.gameReactions(gameId),
    queryFn: () => api.gameReactions(gameId!),
  });
}

export function usePermissionsQuery({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    enabled,
    queryKey: queryKeys.permissions(),
    queryFn: api.permissions,
  });
}

export function useProfileQuery({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    enabled,
    queryKey: queryKeys.profile(),
    queryFn: api.profile,
  });
}

export type AccessLogsQueryResult<TLog> =
  ApiPaginatedAccessLogsResponse<TLog>;
